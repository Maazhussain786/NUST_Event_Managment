import { query } from "@/lib/db";
import {
  ensurePushTablesExist,
  isPushFeatureEnabled,
  PushMessage,
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
       (user_id, event_id, notification_type, trigger_time, dedupe_key, sent_at)
     VALUES
       ($1, $2, $3, $4, $5, NOW())
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
  };
}> {
  const featureEnabled = await isPushFeatureEnabled();
  if (!featureEnabled) {
    return {
      featureEnabled: false,
      candidateCount: 0,
      dispatchedCount: 0,
      inAppCount: 0,
      push: { messageCount: 0, tokenCount: 0, sentCount: 0, failedCount: 0 },
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
    data: {
      type: candidate.type,
      eventId: candidate.eventId,
    },
  }));

  const pushResult = await sendPushNotifications(pushMessages);

  return {
    featureEnabled: true,
    candidateCount: allCandidates.length,
    dispatchedCount: dispatchable.length,
    inAppCount: dispatchable.length,
    push: pushResult,
  };
}
