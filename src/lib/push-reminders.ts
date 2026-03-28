import { query } from "@/lib/db";
import {
  ensurePushTablesExist,
  isPushFeatureEnabled,
  PushMessage,
  PushMessageResult,
  sendPushNotifications,
} from "@/lib/push-notifications";

type ReminderType =
  | "EVENT_STARTING_SOON"
  | "REGISTRATION_CLOSING_SOON"
  | "LIMITED_SEATS_LEFT";

interface ReminderCandidate {
  userId: string;
  eventId: string;
  triggerTime: string;
  title: string;
  body: string;
  link: string;
  type: ReminderType;
}

interface RawCandidateRow {
  user_id: string;
  event_id: string;
  trigger_time: string;
  event_title: string;
  society_name: string;
  remaining_seats?: string | number | null;
}

export interface PushReminderStats {
  generatedAt: string;
  lookbackDays: number;
  tokens: {
    active: number;
    inactive: number;
    expo: number;
    fcm: number;
  };
  summary: Array<{
    notification_type: string;
    dispatch_status: string;
    count: number;
  }>;
  recent: Array<{
    id: string;
    user_id: string;
    user_email: string | null;
    event_id: string;
    event_title: string | null;
    notification_type: string;
    dispatch_status: string;
    attempt_count: number;
    trigger_time: string;
    created_at: string;
    last_attempted_at: string | null;
    delivered_at: string | null;
    last_error: string | null;
  }>;
}

export interface PushReminderRetryInput {
  statuses?: Array<"FAILED" | "NO_TOKENS" | "PARTIAL" | "QUEUED" | "SENT">;
  lookbackHours?: number;
  limit?: number;
  eventId?: string;
  userId?: string;
  notificationType?: ReminderType;
}

function buildDedupeKey(candidate: ReminderCandidate): string {
  return [
    candidate.type,
    candidate.eventId,
    candidate.userId,
    new Date(candidate.triggerTime).toISOString(),
  ].join(":");
}

async function fetchEventStartingSoonCandidates(): Promise<ReminderCandidate[]> {
  const result = await query(
    `SELECT DISTINCT
        att.user_id,
        e.id AS event_id,
        e.event_start AS trigger_time,
        e.title AS event_title,
        s.name AS society_name
     FROM events e
     JOIN societies s ON s.id = e.society_id
     JOIN (
       SELECT event_id, user_id
       FROM tickets
       WHERE status = 'APPROVED' AND cancelled_at IS NULL
       UNION
       SELECT event_id, user_id
       FROM event_registrations
       WHERE cancelled_at IS NULL
     ) att ON att.event_id = e.id
     JOIN users u ON u.id = att.user_id
     WHERE u.status = 'ACTIVE'
       AND e.is_cancelled = FALSE
       AND e.deleted_at IS NULL
       AND e.event_start > NOW() + INTERVAL '50 minutes'
       AND e.event_start <= NOW() + INTERVAL '70 minutes'`,
  );

  return (result.rows as RawCandidateRow[]).map((row) => ({
    userId: row.user_id,
    eventId: row.event_id,
    triggerTime: row.trigger_time,
    title: "Event starts soon",
    body: `${row.event_title} by ${row.society_name} starts in about 1 hour.`,
    link: `/events/${row.event_id}`,
    type: "EVENT_STARTING_SOON",
  }));
}

async function fetchRegistrationClosingCandidates(): Promise<ReminderCandidate[]> {
  const result = await query(
    `WITH event_capacity AS (
       SELECT
         e.id,
         e.society_id,
         e.title,
         e.is_paid,
         e.max_tickets,
         e.max_participants,
         e.registration_end,
         COALESCE((
           SELECT COUNT(*)
           FROM tickets t
           WHERE t.event_id = e.id
             AND t.cancelled_at IS NULL
             AND t.status IN ('PENDING', 'APPROVED')
         ), 0) AS paid_reserved,
         COALESCE((
           SELECT COUNT(*)
           FROM event_registrations er
           WHERE er.event_id = e.id
             AND er.cancelled_at IS NULL
         ), 0) AS free_reserved
       FROM events e
       WHERE e.is_cancelled = FALSE
         AND e.deleted_at IS NULL
         AND e.registration_end IS NOT NULL
         AND e.registration_end > NOW() + INTERVAL '50 minutes'
         AND e.registration_end <= NOW() + INTERVAL '70 minutes'
     )
     SELECT
       fs.user_id,
       ec.id AS event_id,
       ec.registration_end AS trigger_time,
       ec.title AS event_title,
       s.name AS society_name
     FROM event_capacity ec
     JOIN societies s ON s.id = ec.society_id
     JOIN favorite_societies fs ON fs.society_id = ec.society_id
     JOIN users u ON u.id = fs.user_id
     LEFT JOIN tickets t ON t.event_id = ec.id
                         AND t.user_id = fs.user_id
                         AND t.cancelled_at IS NULL
                         AND t.status IN ('PENDING', 'APPROVED')
     LEFT JOIN event_registrations er ON er.event_id = ec.id
                                     AND er.user_id = fs.user_id
                                     AND er.cancelled_at IS NULL
     WHERE u.status = 'ACTIVE'
       AND t.id IS NULL
       AND er.id IS NULL
       AND (
         (
           CASE WHEN ec.is_paid THEN ec.max_tickets ELSE ec.max_participants END
         ) IS NULL
         OR (
           CASE WHEN ec.is_paid THEN ec.max_tickets ELSE ec.max_participants END
         ) > (
           CASE WHEN ec.is_paid THEN ec.paid_reserved ELSE ec.free_reserved END
         )
       )`,
  );

  return (result.rows as RawCandidateRow[]).map((row) => ({
    userId: row.user_id,
    eventId: row.event_id,
    triggerTime: row.trigger_time,
    title: "Registration closing soon",
    body: `Registration for ${row.event_title} closes in about 1 hour.`,
    link: `/events/${row.event_id}`,
    type: "REGISTRATION_CLOSING_SOON",
  }));
}

async function fetchLimitedSeatsCandidates(): Promise<ReminderCandidate[]> {
  const result = await query(
    `WITH event_capacity AS (
       SELECT
         e.id,
         e.society_id,
         e.title,
         e.event_start,
         e.registration_end,
         e.is_paid,
         CASE WHEN e.is_paid THEN e.max_tickets ELSE e.max_participants END AS capacity,
         CASE
           WHEN e.is_paid THEN COALESCE((
             SELECT COUNT(*)
             FROM tickets t
             WHERE t.event_id = e.id
               AND t.cancelled_at IS NULL
               AND t.status IN ('PENDING', 'APPROVED')
           ), 0)
           ELSE COALESCE((
             SELECT COUNT(*)
             FROM event_registrations er
             WHERE er.event_id = e.id
               AND er.cancelled_at IS NULL
           ), 0)
         END AS reserved
       FROM events e
       WHERE e.is_cancelled = FALSE
         AND e.deleted_at IS NULL
         AND e.event_start > NOW()
         AND COALESCE(e.registration_end, e.event_start) > NOW()
     )
     SELECT
       fs.user_id,
       ec.id AS event_id,
       ec.event_start AS trigger_time,
       ec.title AS event_title,
       s.name AS society_name,
       (ec.capacity - ec.reserved) AS remaining_seats
     FROM event_capacity ec
     JOIN societies s ON s.id = ec.society_id
     JOIN favorite_societies fs ON fs.society_id = ec.society_id
     JOIN users u ON u.id = fs.user_id
     LEFT JOIN tickets t ON t.event_id = ec.id
                         AND t.user_id = fs.user_id
                         AND t.cancelled_at IS NULL
                         AND t.status IN ('PENDING', 'APPROVED')
     LEFT JOIN event_registrations er ON er.event_id = ec.id
                                     AND er.user_id = fs.user_id
                                     AND er.cancelled_at IS NULL
     WHERE u.status = 'ACTIVE'
       AND t.id IS NULL
       AND er.id IS NULL
       AND ec.capacity IS NOT NULL
       AND ec.capacity > 0
       AND (ec.capacity - ec.reserved) > 0
       AND (
         (ec.capacity - ec.reserved) <= 5
         OR (ec.capacity - ec.reserved)::numeric <= (ec.capacity::numeric * 0.15)
       )`,
  );

  return (result.rows as RawCandidateRow[]).map((row) => ({
    userId: row.user_id,
    eventId: row.event_id,
    triggerTime: row.trigger_time,
    title: "Limited seats left",
    body: `${row.event_title} is almost full. Only ${Number(row.remaining_seats || 0)} seat(s) left.`,
    link: `/events/${row.event_id}`,
    type: "LIMITED_SEATS_LEFT",
  }));
}

async function reserveReminderDispatch(
  candidate: ReminderCandidate,
): Promise<boolean> {
  const dedupeKey = buildDedupeKey(candidate);
  const result = await query(
    `INSERT INTO event_push_notification_log
       (user_id, event_id, notification_type, trigger_time, dedupe_key, sent_at, dispatch_status, last_attempted_at)
     VALUES
       ($1, $2, $3, $4, $5, NOW(), 'QUEUED', NOW())
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      candidate.userId,
      candidate.eventId,
      candidate.type,
      candidate.triggerTime,
      dedupeKey,
    ],
  );
  return result.rows.length > 0;
}

async function insertInAppNotification(candidate: ReminderCandidate): Promise<void> {
  await query(
    `INSERT INTO notifications (user_id, title, body, link, is_read)
     VALUES ($1, $2, $3, $4, FALSE)`,
    [candidate.userId, candidate.title, candidate.body, candidate.link],
  );
}

async function updateReminderDispatchStatus(
  candidate: ReminderCandidate,
  messageResult: PushMessageResult | undefined,
): Promise<void> {
  const dedupeKey = buildDedupeKey(candidate);

  const status = messageResult?.status || "FAILED";
  const providerStats = messageResult
    ? {
        tokenCount: messageResult.tokenCount,
        sentCount: messageResult.sentCount,
        failedCount: messageResult.failedCount,
      }
    : {
        tokenCount: 0,
        sentCount: 0,
        failedCount: 1,
      };

  let lastError: string | null = null;
  if (status === "NO_TOKENS") {
    lastError = "No active push tokens for user";
  } else if (status === "FAILED") {
    lastError = "Push provider failed to deliver to all tokens";
  } else if (status === "PARTIAL") {
    lastError = "Push delivered to some tokens only";
  }

  await query(
    `UPDATE event_push_notification_log
     SET dispatch_status = $1,
         attempt_count = attempt_count + 1,
         last_attempted_at = NOW(),
         delivered_at = CASE WHEN $1 = 'SENT' THEN NOW() ELSE delivered_at END,
         last_error = $2,
         provider_stats = $3::jsonb
     WHERE dedupe_key = $4`,
    [status, lastError, JSON.stringify(providerStats), dedupeKey],
  );
}

export async function dispatchEventReminderPushNotifications(): Promise<{
  featureEnabled: boolean;
  candidateCount: number;
  dispatchedCount: number;
  inAppCount: number;
  push: {
    messageCount: number;
    tokenCount: number;
    sentCount: number;
    failedCount: number;
    messageResults: PushMessageResult[];
  };
}> {
  const featureEnabled = await isPushFeatureEnabled();
  if (!featureEnabled) {
    return {
      featureEnabled: false,
      candidateCount: 0,
      dispatchedCount: 0,
      inAppCount: 0,
      push: {
        messageCount: 0,
        tokenCount: 0,
        sentCount: 0,
        failedCount: 0,
        messageResults: [],
      },
    };
  }

  await ensurePushTablesExist();

  const [eventStartingSoon, registrationClosingSoon, limitedSeats] =
    await Promise.all([
      fetchEventStartingSoonCandidates(),
      fetchRegistrationClosingCandidates(),
      fetchLimitedSeatsCandidates(),
    ]);

  const allCandidates = [
    ...eventStartingSoon,
    ...registrationClosingSoon,
    ...limitedSeats,
  ];

  const dispatchable: ReminderCandidate[] = [];
  for (const candidate of allCandidates) {
    const reserved = await reserveReminderDispatch(candidate);
    if (reserved) {
      dispatchable.push(candidate);
    }
  }

  for (const candidate of dispatchable) {
    await insertInAppNotification(candidate);
  }

  const pushMessages: PushMessage[] = dispatchable.map((candidate) => ({
    userId: candidate.userId,
    title: candidate.title,
    body: candidate.body,
    link: candidate.link,
    messageKey: buildDedupeKey(candidate),
    data: {
      type: candidate.type,
      eventId: candidate.eventId,
    },
  }));

  const pushResult = await sendPushNotifications(pushMessages);
  const resultByKey = new Map<string, PushMessageResult>();

  for (const result of pushResult.messageResults) {
    resultByKey.set(result.messageKey, result);
  }

  for (const candidate of dispatchable) {
    await updateReminderDispatchStatus(
      candidate,
      resultByKey.get(buildDedupeKey(candidate)),
    );
  }

  return {
    featureEnabled: true,
    candidateCount: allCandidates.length,
    dispatchedCount: dispatchable.length,
    inAppCount: dispatchable.length,
    push: pushResult,
  };
}

export async function previewEventReminderPushCandidates(): Promise<{
  featureEnabled: boolean;
  candidateCount: number;
  breakdown: Record<ReminderType, number>;
}> {
  const featureEnabled = await isPushFeatureEnabled();
  if (!featureEnabled) {
    return {
      featureEnabled: false,
      candidateCount: 0,
      breakdown: {
        EVENT_STARTING_SOON: 0,
        REGISTRATION_CLOSING_SOON: 0,
        LIMITED_SEATS_LEFT: 0,
      },
    };
  }

  await ensurePushTablesExist();

  const [eventStartingSoon, registrationClosingSoon, limitedSeats] =
    await Promise.all([
      fetchEventStartingSoonCandidates(),
      fetchRegistrationClosingCandidates(),
      fetchLimitedSeatsCandidates(),
    ]);

  return {
    featureEnabled: true,
    candidateCount:
      eventStartingSoon.length +
      registrationClosingSoon.length +
      limitedSeats.length,
    breakdown: {
      EVENT_STARTING_SOON: eventStartingSoon.length,
      REGISTRATION_CLOSING_SOON: registrationClosingSoon.length,
      LIMITED_SEATS_LEFT: limitedSeats.length,
    },
  };
}

export async function getPushReminderStats(
  lookbackDays: number = 7,
): Promise<PushReminderStats> {
  await ensurePushTablesExist();

  const safeDays = Number.isFinite(lookbackDays)
    ? Math.min(Math.max(Math.floor(lookbackDays), 1), 90)
    : 7;

  const summaryResult = await query(
    `SELECT
       notification_type,
       dispatch_status,
       COUNT(*)::int AS count
     FROM event_push_notification_log
     WHERE created_at >= NOW() - ($1::text || ' days')::interval
     GROUP BY notification_type, dispatch_status
     ORDER BY notification_type, dispatch_status`,
    [safeDays],
  );

  const recentResult = await query(
    `SELECT
       l.id,
       l.user_id,
       u.email AS user_email,
       l.event_id,
       e.title AS event_title,
       l.notification_type,
       l.dispatch_status,
       l.attempt_count,
       l.trigger_time,
       l.created_at,
       l.last_attempted_at,
       l.delivered_at,
       l.last_error
     FROM event_push_notification_log l
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN events e ON e.id = l.event_id
     WHERE l.created_at >= NOW() - ($1::text || ' days')::interval
     ORDER BY l.created_at DESC
     LIMIT 100`,
    [safeDays],
  );

  const tokenSummary = await query(
    `SELECT
       COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
       COUNT(*) FILTER (WHERE is_active = FALSE)::int AS inactive,
       COUNT(*) FILTER (WHERE is_active = TRUE AND (token LIKE 'ExponentPushToken[%' OR token LIKE 'ExpoPushToken[%'))::int AS expo,
       COUNT(*) FILTER (WHERE is_active = TRUE AND token NOT LIKE 'ExponentPushToken[%' AND token NOT LIKE 'ExpoPushToken[%')::int AS fcm
     FROM user_push_tokens`,
  );

  const tokenRow = tokenSummary.rows[0] || {
    active: 0,
    inactive: 0,
    expo: 0,
    fcm: 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    lookbackDays: safeDays,
    tokens: {
      active: Number(tokenRow.active || 0),
      inactive: Number(tokenRow.inactive || 0),
      expo: Number(tokenRow.expo || 0),
      fcm: Number(tokenRow.fcm || 0),
    },
    summary: (summaryResult.rows || []).map((row) => ({
      notification_type: String(row.notification_type || ""),
      dispatch_status: String(row.dispatch_status || ""),
      count: Number(row.count || 0),
    })),
    recent: (recentResult.rows || []).map((row) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      user_email: row.user_email || null,
      event_id: String(row.event_id),
      event_title: row.event_title || null,
      notification_type: String(row.notification_type || ""),
      dispatch_status: String(row.dispatch_status || ""),
      attempt_count: Number(row.attempt_count || 0),
      trigger_time: String(row.trigger_time),
      created_at: String(row.created_at),
      last_attempted_at: row.last_attempted_at || null,
      delivered_at: row.delivered_at || null,
      last_error: row.last_error || null,
    })),
  };
}

export async function retryPushReminderDispatch(
  input: PushReminderRetryInput = {},
): Promise<{
  deletedCount: number;
  retriedStatuses: string[];
  lookbackHours: number;
  dispatch: Awaited<ReturnType<typeof dispatchEventReminderPushNotifications>>;
}> {
  await ensurePushTablesExist();

  const statuses = input.statuses && input.statuses.length
    ? input.statuses
    : ["FAILED", "NO_TOKENS", "PARTIAL"];

  const lookbackHours = Number.isFinite(input.lookbackHours)
    ? Math.min(Math.max(Math.floor(input.lookbackHours || 24), 1), 24 * 30)
    : 24;

  const limit = Number.isFinite(input.limit)
    ? Math.min(Math.max(Math.floor(input.limit || 500), 1), 5000)
    : 500;

  const conditions = [
    `dispatch_status = ANY($1::text[])`,
    `created_at >= NOW() - ($2::text || ' hours')::interval`,
  ];
  const params: unknown[] = [statuses, lookbackHours];

  if (input.eventId) {
    params.push(input.eventId);
    conditions.push(`event_id = $${params.length}`);
  }

  if (input.userId) {
    params.push(input.userId);
    conditions.push(`user_id = $${params.length}`);
  }

  if (input.notificationType) {
    params.push(input.notificationType);
    conditions.push(`notification_type = $${params.length}`);
  }

  params.push(limit);

  const deleteSql = `
    WITH target_rows AS (
      SELECT dedupe_key
      FROM event_push_notification_log
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    )
    DELETE FROM event_push_notification_log l
    USING target_rows t
    WHERE l.dedupe_key = t.dedupe_key
    RETURNING l.dedupe_key
  `;

  const deleted = await query(deleteSql, params);
  const dispatch = await dispatchEventReminderPushNotifications();

  return {
    deletedCount: deleted.rows.length,
    retriedStatuses: statuses,
    lookbackHours,
    dispatch,
  };
}
