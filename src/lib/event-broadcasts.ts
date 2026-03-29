import { PoolClient } from "pg";
import { query, getClient } from "@/lib/db";
import { writeAuditLog } from "@/lib/api-utils";
import {
  PushMessageResult,
  ensurePushTablesExist,
  sendPushNotifications,
} from "@/lib/push-notifications";

export const EVENT_BROADCAST_UPDATE_TYPES = [
  "GENERAL",
  "SCHEDULE_CHANGE",
  "VENUE_CHANGE",
  "DELAY",
  "EARLY_START",
  "IMPORTANT",
] as const;

export const EVENT_BROADCAST_SEVERITIES = [
  "INFO",
  "IMPORTANT",
  "URGENT",
] as const;

export const EVENT_BROADCAST_TARGET_SCOPES = [
  "ALL_PARTICIPANTS",
  "TICKET_HOLDERS",
  "REGISTRATIONS_ONLY",
] as const;

export const EVENT_BROADCAST_STATUSES = [
  "PENDING",
  "SCHEDULED",
  "PROCESSING",
  "SENT",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
] as const;

export type EventBroadcastUpdateType =
  (typeof EVENT_BROADCAST_UPDATE_TYPES)[number];
export type EventBroadcastSeverity = (typeof EVENT_BROADCAST_SEVERITIES)[number];
export type EventBroadcastTargetScope =
  (typeof EVENT_BROADCAST_TARGET_SCOPES)[number];
export type EventBroadcastStatus = (typeof EVENT_BROADCAST_STATUSES)[number];

export interface EventBroadcast {
  id: string;
  society_id: string;
  event_id: string;
  event_title: string | null;
  created_by: string;
  created_by_name: string | null;
  update_type: EventBroadcastUpdateType;
  severity: EventBroadcastSeverity;
  title: string;
  message: string;
  include_push: boolean;
  include_in_app: boolean;
  target_scope: EventBroadcastTargetScope;
  status: EventBroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  recipient_count: number;
  in_app_delivered_count: number;
  push_token_count: number;
  push_sent_count: number;
  push_failed_count: number;
  last_error: string | null;
  is_automated: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEventBroadcastInput {
  societyId: string;
  eventId: string;
  createdBy: string;
  title: string;
  message: string;
  updateType?: EventBroadcastUpdateType;
  severity?: EventBroadcastSeverity;
  includePush?: boolean;
  includeInApp?: boolean;
  targetScope?: EventBroadcastTargetScope;
  scheduledAt?: string | null;
  isAutomated?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface DispatchEventBroadcastResult {
  ok: boolean;
  reason?: string;
  broadcastId: string;
  status?: EventBroadcastStatus;
  recipientCount: number;
  inAppDeliveredCount: number;
  push: {
    messageCount: number;
    tokenCount: number;
    sentCount: number;
    failedCount: number;
    messageResults: PushMessageResult[];
  };
}

interface BroadcastRow {
  id: string;
  society_id: string;
  event_id: string;
  created_by: string;
  update_type: EventBroadcastUpdateType;
  severity: EventBroadcastSeverity;
  title: string;
  message: string;
  include_push: boolean;
  include_in_app: boolean;
  target_scope: EventBroadcastTargetScope;
  status: EventBroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  recipient_count: number;
  in_app_delivered_count: number;
  push_token_count: number;
  push_sent_count: number;
  push_failed_count: number;
  last_error: string | null;
  is_automated: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  event_title?: string | null;
  created_by_name?: string | null;
}

function isValidUpdateType(value: unknown): value is EventBroadcastUpdateType {
  return (
    typeof value === "string" &&
    EVENT_BROADCAST_UPDATE_TYPES.includes(value as EventBroadcastUpdateType)
  );
}

function isValidSeverity(value: unknown): value is EventBroadcastSeverity {
  return (
    typeof value === "string" &&
    EVENT_BROADCAST_SEVERITIES.includes(value as EventBroadcastSeverity)
  );
}

function isValidTargetScope(value: unknown): value is EventBroadcastTargetScope {
  return (
    typeof value === "string" &&
    EVENT_BROADCAST_TARGET_SCOPES.includes(value as EventBroadcastTargetScope)
  );
}

function toIsoOrNull(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapBroadcastRow(row: BroadcastRow): EventBroadcast {
  return {
    id: row.id,
    society_id: row.society_id,
    event_id: row.event_id,
    event_title: row.event_title || null,
    created_by: row.created_by,
    created_by_name: row.created_by_name || null,
    update_type: row.update_type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    include_push: Boolean(row.include_push),
    include_in_app: Boolean(row.include_in_app),
    target_scope: row.target_scope,
    status: row.status,
    scheduled_at: row.scheduled_at || null,
    sent_at: row.sent_at || null,
    cancelled_at: row.cancelled_at || null,
    recipient_count: Number(row.recipient_count || 0),
    in_app_delivered_count: Number(row.in_app_delivered_count || 0),
    push_token_count: Number(row.push_token_count || 0),
    push_sent_count: Number(row.push_sent_count || 0),
    push_failed_count: Number(row.push_failed_count || 0),
    last_error: row.last_error || null,
    is_automated: Boolean(row.is_automated),
    metadata: row.metadata || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function withClient<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getClient();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function fetchBroadcastById(
  broadcastId: string,
  client?: PoolClient,
): Promise<BroadcastRow | null> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    `SELECT b.*,
            e.title AS event_title,
            u.full_name AS created_by_name
     FROM event_update_broadcasts b
     LEFT JOIN events e ON e.id = b.event_id
     LEFT JOIN users u ON u.id = b.created_by
     WHERE b.id = $1
     LIMIT 1`,
    [broadcastId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as BroadcastRow;
}

async function getRecipientUserIds(
  eventId: string,
  targetScope: EventBroadcastTargetScope,
  client: PoolClient,
): Promise<string[]> {
  if (targetScope === "TICKET_HOLDERS") {
    const ticketResult = await client.query(
      `SELECT DISTINCT t.user_id
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.event_id = $1
         AND t.cancelled_at IS NULL
         AND t.status IN ('PENDING', 'PENDING_VERIFICATION', 'APPROVED')
         AND u.status = 'ACTIVE'`,
      [eventId],
    );
    return ticketResult.rows.map((row) => String(row.user_id));
  }

  if (targetScope === "REGISTRATIONS_ONLY") {
    const regResult = await client.query(
      `SELECT DISTINCT er.user_id
       FROM event_registrations er
       JOIN users u ON u.id = er.user_id
       WHERE er.event_id = $1
         AND er.cancelled_at IS NULL
         AND u.status = 'ACTIVE'`,
      [eventId],
    );
    return regResult.rows.map((row) => String(row.user_id));
  }

  const allResult = await client.query(
    `SELECT DISTINCT participant.user_id
     FROM (
       SELECT t.user_id
       FROM tickets t
       WHERE t.event_id = $1
         AND t.cancelled_at IS NULL
         AND t.status IN ('PENDING', 'PENDING_VERIFICATION', 'APPROVED')
       UNION
       SELECT er.user_id
       FROM event_registrations er
       WHERE er.event_id = $1
         AND er.cancelled_at IS NULL
     ) participant
     JOIN users u ON u.id = participant.user_id
     WHERE u.status = 'ACTIVE'`,
    [eventId],
  );
  return allResult.rows.map((row) => String(row.user_id));
}

function buildMessageKey(broadcastId: string, userId: string): string {
  return `event-broadcast:${broadcastId}:${userId}`;
}

function computeFinalBroadcastStatus(args: {
  recipientCount: number;
  includeInApp: boolean;
  pushResults: PushMessageResult[];
}): EventBroadcastStatus {
  const { recipientCount, includeInApp, pushResults } = args;
  if (recipientCount === 0) return "SENT";
  if (includeInApp) return "SENT";

  const successfulPushUsers = pushResults.filter(
    (entry) => entry.status === "SENT" || entry.status === "PARTIAL",
  ).length;

  if (successfulPushUsers >= recipientCount) return "SENT";
  if (successfulPushUsers > 0) return "PARTIAL";
  return "FAILED";
}

function buildAutomaticBroadcastMessage(input: {
  oldStart: string | null;
  newStart: string | null;
  oldEnd: string | null;
  newEnd: string | null;
  oldVenue: string | null;
  newVenue: string | null;
}): string {
  const changes: string[] = [];

  if (input.oldStart !== input.newStart && input.newStart) {
    const before = input.oldStart
      ? new Date(input.oldStart).toLocaleString("en-PK")
      : "not set";
    const after = new Date(input.newStart).toLocaleString("en-PK");
    changes.push(`Start time updated: ${before} -> ${after}`);
  }

  if (input.oldEnd !== input.newEnd && input.newEnd) {
    const before = input.oldEnd
      ? new Date(input.oldEnd).toLocaleString("en-PK")
      : "not set";
    const after = new Date(input.newEnd).toLocaleString("en-PK");
    changes.push(`End time updated: ${before} -> ${after}`);
  }

  if ((input.oldVenue || "") !== (input.newVenue || "")) {
    const before = input.oldVenue || "not set";
    const after = input.newVenue || "not set";
    changes.push(`Venue updated: ${before} -> ${after}`);
  }

  if (changes.length === 0) {
    return "Event details were updated. Please review the latest event information.";
  }

  return `${changes.join(" | ")}. Please check the event page for full details.`;
}

export async function ensureEventBroadcastTablesExist(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS event_update_broadcasts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      created_by UUID NOT NULL REFERENCES users(id),
      update_type TEXT NOT NULL DEFAULT 'GENERAL',
      severity TEXT NOT NULL DEFAULT 'INFO',
      title VARCHAR(300) NOT NULL,
      message TEXT NOT NULL,
      include_push BOOLEAN NOT NULL DEFAULT TRUE,
      include_in_app BOOLEAN NOT NULL DEFAULT TRUE,
      target_scope TEXT NOT NULL DEFAULT 'ALL_PARTICIPANTS',
      status TEXT NOT NULL DEFAULT 'PENDING',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      cancelled_by UUID REFERENCES users(id),
      recipient_count INTEGER NOT NULL DEFAULT 0,
      in_app_delivered_count INTEGER NOT NULL DEFAULT 0,
      push_token_count INTEGER NOT NULL DEFAULT 0,
      push_sent_count INTEGER NOT NULL DEFAULT 0,
      push_failed_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      is_automated BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_event_update_broadcast_channel
        CHECK (include_push = TRUE OR include_in_app = TRUE)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_update_broadcast_recipients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      broadcast_id UUID NOT NULL REFERENCES event_update_broadcasts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
      push_message_key TEXT,
      push_status TEXT NOT NULL DEFAULT 'QUEUED',
      delivery_status TEXT NOT NULL DEFAULT 'QUEUED',
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (broadcast_id, user_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_event_update_broadcasts_society
    ON event_update_broadcasts (society_id, created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_event_update_broadcasts_event
    ON event_update_broadcasts (event_id, created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_event_update_broadcasts_status
    ON event_update_broadcasts (status, scheduled_at, created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_event_update_broadcast_recipients_broadcast
    ON event_update_broadcast_recipients (broadcast_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_event_update_broadcast_recipients_user
    ON event_update_broadcast_recipients (user_id, created_at DESC)
  `);

  await query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action_enum') THEN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'audit_action_enum'
            AND e.enumlabel = 'EVENT_BROADCAST_CREATED'
        ) THEN
          ALTER TYPE audit_action_enum ADD VALUE 'EVENT_BROADCAST_CREATED';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'audit_action_enum'
            AND e.enumlabel = 'EVENT_BROADCAST_SENT'
        ) THEN
          ALTER TYPE audit_action_enum ADD VALUE 'EVENT_BROADCAST_SENT';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'audit_action_enum'
            AND e.enumlabel = 'EVENT_BROADCAST_CANCELLED'
        ) THEN
          ALTER TYPE audit_action_enum ADD VALUE 'EVENT_BROADCAST_CANCELLED';
        END IF;
      END IF;
    END $$;
  `);
}

export async function listEventBroadcasts(input: {
  societyId: string;
  eventId?: string | null;
  limit?: number;
}): Promise<EventBroadcast[]> {
  await ensureEventBroadcastTablesExist();
  const safeLimit = Number.isFinite(input.limit)
    ? Math.min(Math.max(Math.floor(input.limit || 50), 1), 200)
    : 50;

  const result = await query(
    `SELECT b.*,
            e.title AS event_title,
            u.full_name AS created_by_name
     FROM event_update_broadcasts b
     LEFT JOIN events e ON e.id = b.event_id
     LEFT JOIN users u ON u.id = b.created_by
     WHERE b.society_id = $1
       AND ($2::uuid IS NULL OR b.event_id = $2)
     ORDER BY COALESCE(b.scheduled_at, b.created_at) DESC, b.created_at DESC
     LIMIT $3`,
    [input.societyId, input.eventId || null, safeLimit],
  );

  return (result.rows as BroadcastRow[]).map(mapBroadcastRow);
}

export async function getEventBroadcastById(input: {
  societyId: string;
  broadcastId: string;
}): Promise<EventBroadcast | null> {
  await ensureEventBroadcastTablesExist();
  const result = await query(
    `SELECT b.*,
            e.title AS event_title,
            u.full_name AS created_by_name
     FROM event_update_broadcasts b
     LEFT JOIN events e ON e.id = b.event_id
     LEFT JOIN users u ON u.id = b.created_by
     WHERE b.society_id = $1
       AND b.id = $2
     LIMIT 1`,
    [input.societyId, input.broadcastId],
  );
  if (result.rows.length === 0) return null;
  return mapBroadcastRow(result.rows[0] as BroadcastRow);
}

export async function createEventBroadcast(
  input: CreateEventBroadcastInput,
): Promise<{
  broadcast: EventBroadcast;
  dispatched: boolean;
  dispatchResult?: DispatchEventBroadcastResult;
}> {
  await ensureEventBroadcastTablesExist();
  await ensurePushTablesExist();

  const title = trimText(input.title);
  const message = trimText(input.message);
  if (!title) {
    throw new Error("Title is required.");
  }
  if (!message) {
    throw new Error("Message is required.");
  }
  if (title.length > 300) {
    throw new Error("Title must be at most 300 characters.");
  }
  if (message.length > 4000) {
    throw new Error("Message must be at most 4000 characters.");
  }

  const includePush = input.includePush ?? true;
  const includeInApp = input.includeInApp ?? true;
  if (!includePush && !includeInApp) {
    throw new Error("Select at least one delivery channel.");
  }

  const updateType = isValidUpdateType(input.updateType)
    ? input.updateType
    : "GENERAL";
  const severity = isValidSeverity(input.severity) ? input.severity : "INFO";
  const targetScope = isValidTargetScope(input.targetScope)
    ? input.targetScope
    : "ALL_PARTICIPANTS";

  const scheduledAtIso = toIsoOrNull(input.scheduledAt || null);
  const isScheduled = Boolean(
    scheduledAtIso && new Date(scheduledAtIso).getTime() > Date.now() + 15_000,
  );

  const inserted = await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const eventCheck = await client.query(
        `SELECT e.id, e.title, s.id AS society_id
         FROM events e
         JOIN societies s ON s.id = e.society_id
         WHERE e.id = $1
           AND e.society_id = $2
           AND e.deleted_at IS NULL
         LIMIT 1`,
        [input.eventId, input.societyId],
      );

      if (eventCheck.rows.length === 0) {
        throw new Error("Event not found for this society.");
      }

      const insertResult = await client.query(
        `INSERT INTO event_update_broadcasts (
            society_id,
            event_id,
            created_by,
            update_type,
            severity,
            title,
            message,
            include_push,
            include_in_app,
            target_scope,
            status,
            scheduled_at,
            is_automated,
            metadata,
            updated_at
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14::jsonb, NOW()
         )
         RETURNING id`,
        [
          input.societyId,
          input.eventId,
          input.createdBy,
          updateType,
          severity,
          title,
          message,
          includePush,
          includeInApp,
          targetScope,
          isScheduled ? "SCHEDULED" : "PENDING",
          isScheduled ? scheduledAtIso : null,
          Boolean(input.isAutomated),
          input.metadata ? JSON.stringify(input.metadata) : null,
        ],
      );

      const broadcastId = String(insertResult.rows[0].id);

      await writeAuditLog(
        {
          action: "EVENT_BROADCAST_CREATED",
          performedBy: input.createdBy,
          societyId: input.societyId,
          targetType: "event_broadcast",
          targetId: broadcastId,
          newValue: {
            title,
            update_type: updateType,
            severity,
            target_scope: targetScope,
            include_push: includePush,
            include_in_app: includeInApp,
            scheduled_at: isScheduled ? scheduledAtIso : null,
            event_id: input.eventId,
          },
          metadata: {
            automated: Boolean(input.isAutomated),
            eventTitle: eventCheck.rows[0].title || null,
          },
        },
        client,
      );

      await client.query("COMMIT");
      return broadcastId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  const created = await fetchBroadcastById(inserted);
  if (!created) {
    throw new Error("Broadcast created but could not be loaded.");
  }

  let dispatchResult: DispatchEventBroadcastResult | undefined;
  if (!isScheduled) {
    dispatchResult = await dispatchEventBroadcastById(inserted, {
      actorUserId: input.createdBy,
    });
  }

  const refreshed = await fetchBroadcastById(inserted);
  const payload = refreshed ? mapBroadcastRow(refreshed) : mapBroadcastRow(created);

  return {
    broadcast: payload,
    dispatched: !isScheduled,
    dispatchResult,
  };
}

export async function cancelEventBroadcast(input: {
  societyId: string;
  broadcastId: string;
  cancelledBy: string;
}): Promise<{ ok: boolean; reason?: string; broadcast?: EventBroadcast }> {
  await ensureEventBroadcastTablesExist();

  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query(
        `SELECT *
         FROM event_update_broadcasts
         WHERE id = $1
           AND society_id = $2
         FOR UPDATE`,
        [input.broadcastId, input.societyId],
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "Broadcast not found." };
      }

      const row = result.rows[0] as BroadcastRow;
      if (row.status === "CANCELLED") {
        await client.query("ROLLBACK");
        return { ok: false, reason: "Broadcast is already cancelled." };
      }

      if (["SENT", "PARTIAL", "FAILED"].includes(row.status)) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "Broadcast is already processed." };
      }

      await client.query(
        `UPDATE event_update_broadcasts
         SET status = 'CANCELLED',
             cancelled_at = NOW(),
             cancelled_by = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [input.broadcastId, input.cancelledBy],
      );

      await writeAuditLog(
        {
          action: "EVENT_BROADCAST_CANCELLED",
          performedBy: input.cancelledBy,
          societyId: input.societyId,
          targetType: "event_broadcast",
          targetId: input.broadcastId,
          oldValue: { status: row.status },
          newValue: { status: "CANCELLED" },
          metadata: { eventId: row.event_id },
        },
        client,
      );

      await client.query("COMMIT");
      const refreshed = await fetchBroadcastById(input.broadcastId);
      return {
        ok: true,
        broadcast: refreshed ? mapBroadcastRow(refreshed) : undefined,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function dispatchEventBroadcastById(
  broadcastId: string,
  options?: { actorUserId?: string | null },
): Promise<DispatchEventBroadcastResult> {
  await ensureEventBroadcastTablesExist();
  await ensurePushTablesExist();

  const stageOne = await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const lockResult = await client.query(
        `SELECT *
         FROM event_update_broadcasts
         WHERE id = $1
         FOR UPDATE`,
        [broadcastId],
      );

      if (lockResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false as const, reason: "Broadcast not found." };
      }

      const broadcast = lockResult.rows[0] as BroadcastRow;
      if (broadcast.status === "CANCELLED") {
        await client.query("ROLLBACK");
        return { ok: false as const, reason: "Broadcast is cancelled." };
      }

      if (broadcast.status === "PROCESSING") {
        await client.query("ROLLBACK");
        return { ok: false as const, reason: "Broadcast is already processing." };
      }

      if (broadcast.status === "SENT") {
        await client.query("ROLLBACK");
        return { ok: false as const, reason: "Broadcast is already sent." };
      }

      if (broadcast.scheduled_at) {
        const scheduledAt = new Date(broadcast.scheduled_at).getTime();
        if (scheduledAt > Date.now() + 10_000) {
          await client.query("ROLLBACK");
          return { ok: false as const, reason: "Broadcast is scheduled for later." };
        }
      }

      await client.query(
        `UPDATE event_update_broadcasts
         SET status = 'PROCESSING',
             last_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [broadcastId],
      );

      const recipientUserIds = await getRecipientUserIds(
        broadcast.event_id,
        broadcast.target_scope,
        client,
      );

      if (recipientUserIds.length > 0) {
        await client.query(
          `INSERT INTO event_update_broadcast_recipients (broadcast_id, user_id, delivery_status, push_status, updated_at)
           SELECT $1, recipient_user_id, 'QUEUED', 'QUEUED', NOW()
           FROM UNNEST($2::uuid[]) AS recipient_user_id
           ON CONFLICT (broadcast_id, user_id) DO UPDATE
             SET updated_at = NOW(),
                 delivery_status = 'QUEUED',
                 push_status = 'QUEUED',
                 error = NULL`,
          [broadcastId, recipientUserIds],
        );
      }

      let inAppDeliveredCount = 0;
      if (broadcast.include_in_app && recipientUserIds.length > 0) {
        const insertInApp = await client.query(
          `INSERT INTO notifications (user_id, title, body, link, is_read)
           SELECT recipient_user_id, $2, $3, $4, FALSE
           FROM UNNEST($1::uuid[]) AS recipient_user_id
           RETURNING id, user_id`,
          [
            recipientUserIds,
            broadcast.title,
            broadcast.message,
            `/events/${broadcast.event_id}`,
          ],
        );

        inAppDeliveredCount = insertInApp.rows.length;
        for (const row of insertInApp.rows) {
          await client.query(
            `UPDATE event_update_broadcast_recipients
             SET notification_id = $3,
                 delivery_status = 'IN_APP_SENT',
                 updated_at = NOW()
             WHERE broadcast_id = $1
               AND user_id = $2`,
            [broadcastId, String(row.user_id), String(row.id)],
          );
        }
      }

      await client.query("COMMIT");
      return {
        ok: true as const,
        broadcast,
        recipientUserIds,
        inAppDeliveredCount,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  if (!stageOne.ok) {
    return {
      ok: false,
      reason: stageOne.reason,
      broadcastId,
      recipientCount: 0,
      inAppDeliveredCount: 0,
      push: {
        messageCount: 0,
        tokenCount: 0,
        sentCount: 0,
        failedCount: 0,
        messageResults: [],
      },
    };
  }

  const { broadcast, recipientUserIds, inAppDeliveredCount } = stageOne;

  let pushResult: {
    messageCount: number;
    tokenCount: number;
    sentCount: number;
    failedCount: number;
    messageResults: PushMessageResult[];
  } = {
    messageCount: 0,
    tokenCount: 0,
    sentCount: 0,
    failedCount: 0,
    messageResults: [],
  };

  if (broadcast.include_push && recipientUserIds.length > 0) {
    pushResult = await sendPushNotifications(
      recipientUserIds.map((userId) => ({
        userId,
        title: broadcast.title,
        body: broadcast.message,
        link: `/events/${broadcast.event_id}`,
        messageKey: buildMessageKey(broadcast.id, userId),
        data: {
          type: "EVENT_BROADCAST",
          eventId: broadcast.event_id,
          broadcastId: broadcast.id,
          updateType: broadcast.update_type,
        },
      })),
    );
  }

  const statusByUser = new Map<string, PushMessageResult>();
  for (const row of pushResult.messageResults) {
    statusByUser.set(row.userId, row);
  }

  const finalStatus = computeFinalBroadcastStatus({
    recipientCount: recipientUserIds.length,
    includeInApp: broadcast.include_in_app,
    pushResults: pushResult.messageResults,
  });

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const userId of recipientUserIds) {
        const pushRow = statusByUser.get(userId);
        const pushStatus = pushRow?.status || "NO_TOKENS";
        const deliveryStatus = broadcast.include_in_app
          ? "SENT"
          : pushStatus === "SENT" || pushStatus === "PARTIAL"
            ? "SENT"
            : pushStatus === "NO_TOKENS"
              ? "NO_CHANNEL"
              : "FAILED";

        await client.query(
          `UPDATE event_update_broadcast_recipients
           SET push_message_key = COALESCE($3, push_message_key),
               push_status = $4,
               delivery_status = $5,
               error = CASE
                 WHEN $4 = 'FAILED' THEN 'Push delivery failed'
                 WHEN $4 = 'NO_TOKENS' THEN 'No active push tokens'
                 ELSE NULL
               END,
               updated_at = NOW()
           WHERE broadcast_id = $1
             AND user_id = $2`,
          [
            broadcastId,
            userId,
            pushRow?.messageKey || null,
            pushStatus,
            deliveryStatus,
          ],
        );
      }

      await client.query(
        `UPDATE event_update_broadcasts
         SET status = $2,
             sent_at = NOW(),
             recipient_count = $3,
             in_app_delivered_count = $4,
             push_token_count = $5,
             push_sent_count = $6,
             push_failed_count = $7,
             last_error = $8,
             updated_at = NOW()
         WHERE id = $1`,
        [
          broadcastId,
          finalStatus,
          recipientUserIds.length,
          inAppDeliveredCount,
          pushResult.tokenCount,
          pushResult.sentCount,
          pushResult.failedCount,
          finalStatus === "FAILED"
            ? "Unable to deliver to recipients."
            : recipientUserIds.length === 0
              ? "No participants found for target scope."
              : null,
        ],
      );

      if (options?.actorUserId || broadcast.created_by) {
        await writeAuditLog(
          {
            action: "EVENT_BROADCAST_SENT",
            performedBy: options?.actorUserId || broadcast.created_by,
            societyId: broadcast.society_id,
            targetType: "event_broadcast",
            targetId: broadcastId,
            metadata: {
              eventId: broadcast.event_id,
              updateType: broadcast.update_type,
              severity: broadcast.severity,
              recipientCount: recipientUserIds.length,
              inAppDeliveredCount,
              push: {
                tokenCount: pushResult.tokenCount,
                sentCount: pushResult.sentCount,
                failedCount: pushResult.failedCount,
              },
              status: finalStatus,
            },
          },
          client,
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return {
    ok: true,
    broadcastId,
    status: finalStatus,
    recipientCount: recipientUserIds.length,
    inAppDeliveredCount,
    push: pushResult,
  };
}

export async function dispatchScheduledEventBroadcasts(
  limit: number = 20,
): Promise<{
  scanned: number;
  dispatched: number;
  failed: number;
  skipped: number;
  results: DispatchEventBroadcastResult[];
}> {
  await ensureEventBroadcastTablesExist();
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 200)
    : 20;

  const dueResult = await query(
    `SELECT id
     FROM event_update_broadcasts
     WHERE status IN ('SCHEDULED', 'PENDING')
       AND cancelled_at IS NULL
       AND (scheduled_at IS NULL OR scheduled_at <= NOW())
     ORDER BY COALESCE(scheduled_at, created_at) ASC
     LIMIT $1`,
    [safeLimit],
  );

  const results: DispatchEventBroadcastResult[] = [];
  for (const row of dueResult.rows) {
    const res = await dispatchEventBroadcastById(String(row.id));
    results.push(res);
  }

  const dispatched = results.filter((item) => item.ok).length;
  const failed = results.filter(
    (item) => !item.ok && item.reason !== "Broadcast is scheduled for later.",
  ).length;
  const skipped = results.length - dispatched - failed;

  return {
    scanned: dueResult.rows.length,
    dispatched,
    failed,
    skipped,
    results,
  };
}

export async function createAutomaticEventUpdateBroadcast(input: {
  societyId: string;
  eventId: string;
  actorUserId: string;
  eventTitle: string;
  oldStart?: string | null;
  newStart?: string | null;
  oldEnd?: string | null;
  newEnd?: string | null;
  oldVenue?: string | null;
  newVenue?: string | null;
}): Promise<EventBroadcast | null> {
  const startChanged = (input.oldStart || null) !== (input.newStart || null);
  const endChanged = (input.oldEnd || null) !== (input.newEnd || null);
  const venueChanged = (input.oldVenue || "") !== (input.newVenue || "");

  if (!startChanged && !endChanged && !venueChanged) {
    return null;
  }

  let updateType: EventBroadcastUpdateType = "IMPORTANT";
  let severity: EventBroadcastSeverity = "IMPORTANT";
  let title = `Event update: ${input.eventTitle}`;

  if (startChanged && input.oldStart && input.newStart) {
    const oldMs = new Date(input.oldStart).getTime();
    const newMs = new Date(input.newStart).getTime();
    if (Number.isFinite(oldMs) && Number.isFinite(newMs)) {
      if (newMs > oldMs) {
        updateType = "DELAY";
        severity = "URGENT";
        title = `Event delayed: ${input.eventTitle}`;
      } else if (newMs < oldMs) {
        updateType = "EARLY_START";
        severity = "URGENT";
        title = `Event starting earlier: ${input.eventTitle}`;
      } else {
        updateType = "SCHEDULE_CHANGE";
      }
    }
  } else if (startChanged || endChanged) {
    updateType = "SCHEDULE_CHANGE";
  } else if (venueChanged) {
    updateType = "VENUE_CHANGE";
  }

  const message = buildAutomaticBroadcastMessage({
    oldStart: input.oldStart || null,
    newStart: input.newStart || null,
    oldEnd: input.oldEnd || null,
    newEnd: input.newEnd || null,
    oldVenue: input.oldVenue || null,
    newVenue: input.newVenue || null,
  });

  const created = await createEventBroadcast({
    societyId: input.societyId,
    eventId: input.eventId,
    createdBy: input.actorUserId,
    title,
    message,
    updateType,
    severity,
    includeInApp: true,
    includePush: true,
    targetScope: "ALL_PARTICIPANTS",
    isAutomated: true,
    metadata: {
      source: "event_edit_auto_broadcast",
      fieldsChanged: {
        start: startChanged,
        end: endChanged,
        venue: venueChanged,
      },
      old: {
        event_start: input.oldStart || null,
        event_end: input.oldEnd || null,
        venue: input.oldVenue || null,
      },
      new: {
        event_start: input.newStart || null,
        event_end: input.newEnd || null,
        venue: input.newVenue || null,
      },
    },
  });

  return created.broadcast;
}
