import { query } from "@/lib/db";

export type PushPlatform = "ios" | "android" | "web" | "expo" | "unknown";

export interface RegisterPushTokenInput {
  token: string;
  platform?: PushPlatform;
  deviceId?: string | null;
  appVersion?: string | null;
  locale?: string | null;
  timezone?: string | null;
}

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, string>;
  messageKey?: string;
}

export interface PushMessageResult {
  messageKey: string;
  userId: string;
  tokenCount: number;
  sentCount: number;
  failedCount: number;
  status: "SENT" | "PARTIAL" | "FAILED" | "NO_TOKENS";
}

export interface PushReminderPreferences {
  eventStartingSoon: boolean;
  registrationClosingSoon: boolean;
  limitedSeatsLeft: boolean;
}

type Provider = "expo" | "fcm";

interface ActiveTokenRow {
  id: string;
  user_id: string;
  token: string;
}

interface DeliveryPayload {
  messageKey: string;
  userId: string;
  tokenId: string;
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface DeliveryAccumulator {
  messageKey: string;
  userId: string;
  tokenCount: number;
  sentCount: number;
  failedCount: number;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const FCM_SEND_URL = "https://fcm.googleapis.com/fcm/send";
const DEFAULT_PUSH_REMINDER_PREFERENCES: PushReminderPreferences = {
  eventStartingSoon: true,
  registrationClosingSoon: true,
  limitedSeatsLeft: true,
};

function detectProvider(token: string): Provider {
  if (
    token.startsWith("ExponentPushToken[") ||
    token.startsWith("ExpoPushToken[")
  ) {
    return "expo";
  }
  return "fcm";
}

function cleanToken(token: string): string {
  return token.trim();
}

function statusFromAccumulator(
  acc: DeliveryAccumulator,
): PushMessageResult["status"] {
  if (acc.tokenCount === 0) return "NO_TOKENS";
  if (acc.sentCount > 0 && acc.failedCount === 0) return "SENT";
  if (acc.sentCount > 0 && acc.failedCount > 0) return "PARTIAL";
  return "FAILED";
}

function addSent(acc: DeliveryAccumulator): void {
  acc.sentCount += 1;
}

function addFailed(acc: DeliveryAccumulator): void {
  acc.failedCount += 1;
}

function buildMessageKey(message: PushMessage, index: number): string {
  if (message.messageKey && message.messageKey.trim()) {
    return message.messageKey.trim();
  }
  return `msg:${message.userId}:${index}`;
}

export async function ensurePushTablesExist(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS user_push_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'unknown',
      device_id TEXT,
      app_version TEXT,
      locale TEXT,
      timezone TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      invalidated_reason TEXT,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_active
    ON user_push_tokens (user_id, is_active)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_push_notification_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      notification_type TEXT NOT NULL,
      trigger_time TIMESTAMPTZ NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE event_push_notification_log
    ADD COLUMN IF NOT EXISTS dispatch_status TEXT NOT NULL DEFAULT 'QUEUED'
  `);

  await query(`
    ALTER TABLE event_push_notification_log
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE event_push_notification_log
    ADD COLUMN IF NOT EXISTS last_error TEXT
  `);

  await query(`
    ALTER TABLE event_push_notification_log
    ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ
  `);

  await query(`
    ALTER TABLE event_push_notification_log
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ
  `);

  await query(`
    ALTER TABLE event_push_notification_log
    ADD COLUMN IF NOT EXISTS provider_stats JSONB
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_event_push_notification_lookup
    ON event_push_notification_log (user_id, event_id, notification_type, trigger_time)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_event_push_notification_status
    ON event_push_notification_log (dispatch_status, created_at DESC)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_push_preferences (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      event_starting_soon BOOLEAN NOT NULL DEFAULT TRUE,
      registration_closing_soon BOOLEAN NOT NULL DEFAULT TRUE,
      limited_seats_left BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function mapPreferenceRow(
  row: Record<string, unknown> | undefined,
): PushReminderPreferences {
  if (!row) {
    return { ...DEFAULT_PUSH_REMINDER_PREFERENCES };
  }

  return {
    eventStartingSoon:
      row.event_starting_soon === undefined
        ? DEFAULT_PUSH_REMINDER_PREFERENCES.eventStartingSoon
        : Boolean(row.event_starting_soon),
    registrationClosingSoon:
      row.registration_closing_soon === undefined
        ? DEFAULT_PUSH_REMINDER_PREFERENCES.registrationClosingSoon
        : Boolean(row.registration_closing_soon),
    limitedSeatsLeft:
      row.limited_seats_left === undefined
        ? DEFAULT_PUSH_REMINDER_PREFERENCES.limitedSeatsLeft
        : Boolean(row.limited_seats_left),
  };
}

export async function getPushReminderPreferences(
  userId: string,
): Promise<PushReminderPreferences> {
  await ensurePushTablesExist();

  await query(
    `INSERT INTO user_push_preferences (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  const result = await query(
    `SELECT event_starting_soon, registration_closing_soon, limited_seats_left
     FROM user_push_preferences
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return mapPreferenceRow(result.rows[0]);
}

export async function updatePushReminderPreferences(
  userId: string,
  patch: Partial<PushReminderPreferences>,
): Promise<PushReminderPreferences> {
  const current = await getPushReminderPreferences(userId);
  const next: PushReminderPreferences = {
    eventStartingSoon:
      typeof patch.eventStartingSoon === "boolean"
        ? patch.eventStartingSoon
        : current.eventStartingSoon,
    registrationClosingSoon:
      typeof patch.registrationClosingSoon === "boolean"
        ? patch.registrationClosingSoon
        : current.registrationClosingSoon,
    limitedSeatsLeft:
      typeof patch.limitedSeatsLeft === "boolean"
        ? patch.limitedSeatsLeft
        : current.limitedSeatsLeft,
  };

  await query(
    `INSERT INTO user_push_preferences
       (user_id, event_starting_soon, registration_closing_soon, limited_seats_left, updated_at)
     VALUES
       ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       event_starting_soon = EXCLUDED.event_starting_soon,
       registration_closing_soon = EXCLUDED.registration_closing_soon,
       limited_seats_left = EXCLUDED.limited_seats_left,
       updated_at = NOW()`,
    [
      userId,
      next.eventStartingSoon,
      next.registrationClosingSoon,
      next.limitedSeatsLeft,
    ],
  );

  return next;
}

export async function isPushFeatureEnabled(): Promise<boolean> {
  try {
    const result = await query(
      `SELECT enabled
       FROM platform_feature_flags
       WHERE key = 'notifications'
       LIMIT 1`,
    );

    if (result.rows.length === 0) return true;
    return Boolean(result.rows[0].enabled);
  } catch {
    return true;
  }
}

export async function upsertPushToken(
  userId: string,
  input: RegisterPushTokenInput,
): Promise<void> {
  await ensurePushTablesExist();

  const token = cleanToken(input.token);
  const platform = (input.platform || "unknown").toLowerCase();

  await query(
    `INSERT INTO user_push_tokens
       (user_id, token, platform, device_id, app_version, locale, timezone, is_active, invalidated_reason, last_seen_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, TRUE, NULL, NOW(), NOW())
     ON CONFLICT (token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       device_id = EXCLUDED.device_id,
       app_version = EXCLUDED.app_version,
       locale = EXCLUDED.locale,
       timezone = EXCLUDED.timezone,
       is_active = TRUE,
       invalidated_reason = NULL,
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [
      userId,
      token,
      platform,
      input.deviceId || null,
      input.appVersion || null,
      input.locale || null,
      input.timezone || null,
    ],
  );
}

export async function deactivatePushToken(
  userId: string,
  token: string,
  reason: string = "User requested unregistration",
): Promise<void> {
  await ensurePushTablesExist();

  await query(
    `UPDATE user_push_tokens
     SET is_active = FALSE, invalidated_reason = $3, updated_at = NOW()
     WHERE user_id = $1 AND token = $2`,
    [userId, cleanToken(token), reason],
  );
}

export async function listActivePushTokensForUser(userId: string): Promise<
  Array<{
    id: string;
    platform: string;
    device_id: string | null;
    app_version: string | null;
    locale: string | null;
    timezone: string | null;
    last_seen_at: string;
    created_at: string;
  }>
> {
  await ensurePushTablesExist();

  const result = await query(
    `SELECT id, platform, device_id, app_version, locale, timezone, last_seen_at, created_at
     FROM user_push_tokens
     WHERE user_id = $1 AND is_active = TRUE
     ORDER BY last_seen_at DESC`,
    [userId],
  );

  return result.rows;
}

async function deactivateInvalidTokenIds(ids: string[]): Promise<void> {
  if (!ids.length) return;

  await query(
    `UPDATE user_push_tokens
     SET is_active = FALSE,
         invalidated_reason = 'Push provider reported invalid token',
         updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [ids],
  );
}

export async function sendPushNotifications(messages: PushMessage[]): Promise<{
  messageCount: number;
  tokenCount: number;
  sentCount: number;
  failedCount: number;
  messageResults: PushMessageResult[];
}> {
  if (!messages.length) {
    return {
      messageCount: 0,
      tokenCount: 0,
      sentCount: 0,
      failedCount: 0,
      messageResults: [],
    };
  }

  await ensurePushTablesExist();

  const uniqueUserIds = Array.from(new Set(messages.map((m) => m.userId)));
  const tokenResult = await query(
    `SELECT id, user_id, token
     FROM user_push_tokens
     WHERE is_active = TRUE
       AND user_id = ANY($1::uuid[])`,
    [uniqueUserIds],
  );

  const tokensByUser = new Map<string, ActiveTokenRow[]>();
  for (const row of tokenResult.rows as ActiveTokenRow[]) {
    if (!tokensByUser.has(row.user_id)) tokensByUser.set(row.user_id, []);
    tokensByUser.get(row.user_id)!.push(row);
  }

  const accumulators = new Map<string, DeliveryAccumulator>();
  const expoPayloads: DeliveryPayload[] = [];
  const fcmPayloads: DeliveryPayload[] = [];
  const invalidTokenIds = new Set<string>();

  messages.forEach((message, index) => {
    const messageKey = buildMessageKey(message, index);
    const userTokens = tokensByUser.get(message.userId) || [];

    const acc: DeliveryAccumulator = {
      messageKey,
      userId: message.userId,
      tokenCount: userTokens.length,
      sentCount: 0,
      failedCount: 0,
    };
    accumulators.set(messageKey, acc);

    for (const tokenRow of userTokens) {
      const payload: DeliveryPayload = {
        messageKey,
        userId: message.userId,
        tokenId: tokenRow.id,
        to: tokenRow.token,
        title: message.title,
        body: message.body,
        data: {
          ...(message.data || {}),
          ...(message.link ? { link: message.link } : {}),
        },
      };

      const provider = detectProvider(tokenRow.token);
      if (provider === "expo") {
        expoPayloads.push(payload);
      } else {
        fcmPayloads.push(payload);
      }
    }
  });

  const markSent = (payload: DeliveryPayload) => {
    const acc = accumulators.get(payload.messageKey);
    if (acc) addSent(acc);
  };

  const markFailed = (payload: DeliveryPayload) => {
    const acc = accumulators.get(payload.messageKey);
    if (acc) addFailed(acc);
  };

  for (let i = 0; i < expoPayloads.length; i += 100) {
    const chunk = expoPayloads.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((item) => ({
            to: item.to,
            title: item.title,
            body: item.body,
            sound: "default",
            data: item.data,
          })),
        ),
      });

      if (!res.ok) {
        chunk.forEach(markFailed);
        continue;
      }

      const json = (await res.json()) as {
        data?: Array<{
          status?: string;
          details?: { error?: string };
        }>;
      };

      const data = json.data || [];
      chunk.forEach((item, index) => {
        const ticket = data[index];
        if (ticket?.status === "ok") {
          markSent(item);
          return;
        }

        markFailed(item);
        const errorCode = ticket?.details?.error || "";
        if (errorCode === "DeviceNotRegistered") {
          invalidTokenIds.add(item.tokenId);
        }
      });
    } catch {
      chunk.forEach(markFailed);
    }
  }

  const fcmServerKey = process.env.FCM_SERVER_KEY || "";
  if (!fcmServerKey && fcmPayloads.length > 0) {
    fcmPayloads.forEach(markFailed);
  } else {
    for (const payload of fcmPayloads) {
      try {
        const res = await fetch(FCM_SEND_URL, {
          method: "POST",
          headers: {
            Authorization: `key=${fcmServerKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: payload.to,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: payload.data || {},
            priority: "high",
          }),
        });

        if (!res.ok) {
          markFailed(payload);
          continue;
        }

        const json = (await res.json()) as {
          success?: number;
          results?: Array<{ error?: string }>;
        };

        if (json.success && json.success > 0) {
          markSent(payload);
          continue;
        }

        markFailed(payload);
        const errorCode = json.results?.[0]?.error || "";
        if (
          errorCode === "NotRegistered" ||
          errorCode === "InvalidRegistration"
        ) {
          invalidTokenIds.add(payload.tokenId);
        }
      } catch {
        markFailed(payload);
      }
    }
  }

  await deactivateInvalidTokenIds(Array.from(invalidTokenIds));

  const messageResults: PushMessageResult[] = Array.from(accumulators.values()).map(
    (acc) => ({
      messageKey: acc.messageKey,
      userId: acc.userId,
      tokenCount: acc.tokenCount,
      sentCount: acc.sentCount,
      failedCount: acc.failedCount,
      status: statusFromAccumulator(acc),
    }),
  );

  const sentCount = messageResults.reduce((sum, row) => sum + row.sentCount, 0);
  const failedCount = messageResults.reduce(
    (sum, row) => sum + row.failedCount,
    0,
  );
  const tokenCount = messageResults.reduce((sum, row) => sum + row.tokenCount, 0);

  return {
    messageCount: messages.length,
    tokenCount,
    sentCount,
    failedCount,
    messageResults,
  };
}
