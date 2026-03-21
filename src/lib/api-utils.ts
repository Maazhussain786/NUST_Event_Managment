/**
 * API Hardening Utilities
 *
 * Shared patterns for:
 * - Standardized error responses
 * - IP address extraction
 * - Audit log helpers with before/after snapshots
 * - Rate limiting for non-upload routes
 * - Edge-case guards (emergency mode, blackout, deactivated society)
 * - Soft-delete restore helpers
 */

import { NextRequest, NextResponse } from 'next/server';
import { PoolClient } from 'pg';
import { query } from './db';

// ============================================================================
// Standardized Error Responses
// ============================================================================

export const ApiErrors = {
  unauthorized: () =>
    NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  forbidden: (detail?: string) =>
    NextResponse.json(
      { error: detail || 'Forbidden — insufficient privileges' },
      { status: 403 }
    ),
  notFound: (entity = 'Resource') =>
    NextResponse.json({ error: `${entity} not found` }, { status: 404 }),
  conflict: (detail: string, meta?: Record<string, unknown>) =>
    NextResponse.json({ error: detail, ...meta }, { status: 409 }),
  validation: (detail: string) =>
    NextResponse.json({ error: detail }, { status: 400 }),
  rateLimited: (retryAfterSec = 60) =>
    NextResponse.json(
      { error: 'Too many requests — try again later' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    ),
  locked: (detail: string) =>
    NextResponse.json({ error: detail }, { status: 423 }),
  serverError: (logMessage: string, error: unknown) => {
    console.error(logMessage, error);
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      const err = error as {
        message?: string;
        code?: string;
        detail?: string;
        constraint?: string;
      };
      return NextResponse.json(
        {
          error: 'Internal server error',
          detail: err?.message || null,
          code: err?.code || null,
          constraint: err?.constraint || null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  },
} as const;

// ============================================================================
// IP Address Extraction
// ============================================================================

export function extractIpAddress(req: NextRequest): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.ip ||
    null
  );
}

// ============================================================================
// Enhanced Audit Logger
// ============================================================================

export interface AuditEntry {
  action: string;
  performedBy: string;
  societyId?: string | null;
  targetType?: string;
  targetId?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Write an audit log entry with full metadata.
 * Works within a transaction (client) or standalone (query).
 */
export async function writeAuditLog(
  entry: AuditEntry,
  client?: PoolClient
): Promise<void> {
  const sql = `
    INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;
  const params = [
    entry.action,
    entry.performedBy,
    entry.societyId || null,
    entry.targetType || null,
    entry.targetId || null,
    entry.oldValue ? JSON.stringify(entry.oldValue) : null,
    entry.newValue ? JSON.stringify(entry.newValue) : null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
    entry.ipAddress || null,
  ];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}

/**
 * Build a before/after diff for audit logs.
 * Only includes fields that actually changed.
 */
export function buildAuditDiff(
  oldRow: Record<string, unknown>,
  newValues: Record<string, unknown>,
  fields: string[]
): { oldValue: Record<string, unknown>; newValue: Record<string, unknown> } {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const field of fields) {
    if (field in newValues && JSON.stringify(newValues[field]) !== JSON.stringify(oldRow[field])) {
      oldValue[field] = oldRow[field];
      newValue[field] = newValues[field];
    }
  }

  return { oldValue, newValue };
}

// ============================================================================
// Non-Upload Rate Limiting (in-memory, per-process)
// ============================================================================

interface RateBucket {
  count: number;
  windowStart: number;
}

const apiRateLimits = new Map<string, RateBucket>();

/**
 * Rate limit non-upload API requests.
 * Returns null if the request is allowed, or a 429 response if rate-limited.
 */
export function checkApiRateLimit(
  userId: string,
  action: string,
  maxPerMinute: number
): NextResponse | null {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const bucket = apiRateLimits.get(key);

  if (!bucket || now - bucket.windowStart > 60_000) {
    apiRateLimits.set(key, { count: 1, windowStart: now });
    return null;
  }

  if (bucket.count >= maxPerMinute) {
    return ApiErrors.rateLimited(60);
  }

  bucket.count++;
  return null;
}

// Clean up old rate limit entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    apiRateLimits.forEach((bucket, key) => {
      if (now - bucket.windowStart > 120_000) {
        apiRateLimits.delete(key);
      }
    });
  }, 5 * 60 * 1000);
}

// ============================================================================
// Edge-Case Guards
// ============================================================================

/**
 * Check if a society is in a valid operational state.
 * Returns null if OK, or an error response if blocked.
 */
export async function checkSocietyOperational(
  societyId: string,
  client?: PoolClient
): Promise<NextResponse | null> {
  const q = client ? client.query.bind(client) : query;
  // IMPORTANT: avoid error-driven fallbacks inside transactions.
  // A failed statement marks the transaction aborted (25P02) until ROLLBACK.
  const emergencyCol = await q(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'society_settings'
       AND column_name = 'emergency_mode'
     LIMIT 1`
  );

  const hasEmergencyMode = emergencyCol.rows.length > 0;

  const result = hasEmergencyMode
    ? await q(
        `SELECT s.status, s.deleted_at,
                COALESCE(ss.emergency_mode, FALSE) AS emergency_mode
         FROM societies s
         LEFT JOIN society_settings ss ON ss.society_id = s.id
         WHERE s.id = $1`,
        [societyId]
      )
    : await q(
        `SELECT s.status, s.deleted_at, FALSE AS emergency_mode
         FROM societies s
         WHERE s.id = $1`,
        [societyId]
      );

  if (result.rows.length === 0) {
    return ApiErrors.notFound('Society');
  }

  const society = result.rows[0];

  if (society.deleted_at) {
    return ApiErrors.conflict('Society has been deleted');
  }

  if (society.status === 'SUSPENDED' || society.status === 'DEACTIVATED') {
    return ApiErrors.conflict(`Society is ${society.status.toLowerCase()} — operations are blocked`);
  }

  if (society.emergency_mode) {
    return ApiErrors.locked('Society is in emergency mode — all operations are temporarily suspended');
  }

  return null; // OK
}

/**
 * Check if an event falls within a blackout period.
 * Returns null if OK, or an error detail string if blocked.
 */
export async function checkBlackoutPeriod(
  eventStart: Date,
  eventEnd: Date,
  client?: PoolClient
): Promise<string | null> {
  const q = client ? client.query.bind(client) : query;
  // Some environments do not yet have blackout_dates or required columns.
  // Avoid executing a query that might fail inside a transaction.
  const cols = await q(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'blackout_dates'
       AND column_name IN ('title', 'start_date', 'end_date', 'is_active')`
  );

  const required = new Set(['title', 'start_date', 'end_date', 'is_active']);
  for (const row of cols.rows) {
    required.delete(row.column_name);
  }
  if (required.size > 0) return null;

  const result = await q(
    `SELECT title, start_date, end_date FROM blackout_dates
     WHERE is_active = TRUE
       AND start_date <= $2::date AND end_date >= $1::date`,
    [eventStart.toISOString(), eventEnd.toISOString()]
  );

  if (result.rows.length > 0) {
    const b = result.rows[0];
    return `Event overlaps with blackout period "${b.title}" (${b.start_date} — ${b.end_date})`;
  }

  return null;
}

/**
 * Validate that max_participants is not reduced below current count.
 * Returns null if OK, or an error string if violated.
 */
export async function validateCapacityReduction(
  eventId: string,
  newMaxParticipants: number,
  client: PoolClient
): Promise<string | null> {
  const result = await client.query(
    `SELECT participants_count, 
            (SELECT COUNT(*) FROM tickets WHERE event_id = $1 AND status = 'APPROVED') AS approved_tickets,
            (SELECT COUNT(*) FROM event_registrations WHERE event_id = $1 AND cancelled_at IS NULL) AS active_registrations
     FROM events WHERE id = $1`,
    [eventId]
  );

  if (result.rows.length === 0) return 'Event not found';

  const { approved_tickets, active_registrations } = result.rows[0];
  const currentCount = Math.max(
    parseInt(approved_tickets),
    parseInt(active_registrations)
  );

  if (newMaxParticipants < currentCount) {
    return `Cannot reduce capacity to ${newMaxParticipants} — there are ${currentCount} active registrations/tickets`;
  }

  return null;
}

/**
 * Validate that ticket price is not changed after approved payments exist.
 */
export async function validatePriceChange(
  eventId: string,
  client: PoolClient
): Promise<string | null> {
  const result = await client.query(
    `SELECT COUNT(*) AS count FROM tickets t
     JOIN payment_proofs pp ON pp.ticket_id = t.id
     WHERE t.event_id = $1 AND t.status = 'APPROVED'`,
    [eventId]
  );

  if (parseInt(result.rows[0].count) > 0) {
    return 'Cannot change ticket price — approved payments exist';
  }

  return null;
}

/**
 * Validate that event times are not changed after check-ins exist.
 */
export async function validateTimeChangeAfterCheckIn(
  eventId: string,
  client: PoolClient
): Promise<string | null> {
  const result = await client.query(
    `SELECT COUNT(*) AS count FROM event_attendance WHERE event_id = $1`,
    [eventId]
  );

  if (parseInt(result.rows[0].count) > 0) {
    return 'Cannot change event time — attendees have already checked in';
  }

  return null;
}

// ============================================================================
// Soft Delete + Restore Helpers
// ============================================================================

// Allowlist of tables/columns that can be used with soft-delete/restore
const ALLOWED_TABLES = new Set([
  'events', 'societies', 'society_posts', 'society_albums',
  'society_album_photos', 'society_media', 'society_memberships',
  'event_registrations', 'tickets', 'notifications',
]);

const ALLOWED_COLUMNS = new Set([
  'society_id', 'event_id', 'user_id', 'album_id', 'post_id',
]);

function assertValidTable(table: string): void {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
}

function assertValidColumn(column: string): void {
  if (!ALLOWED_COLUMNS.has(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
}

/**
 * Soft-delete a record by setting deleted_at and deleted_by.
 * Works with tables that have both is_deleted and deleted_at columns.
 */
export async function softDelete(
  client: PoolClient,
  table: string,
  id: string,
  deletedBy: string,
  extraWhere?: { column: string; value: string }
): Promise<boolean> {
  assertValidTable(table);
  if (extraWhere) assertValidColumn(extraWhere.column);

  const whereExtra = extraWhere ? ` AND ${extraWhere.column} = $4` : '';
  const params = extraWhere
    ? [id, deletedBy, deletedBy, extraWhere.value]
    : [id, deletedBy, deletedBy];

  // Handle tables with is_deleted boolean + deleted_at timestamp
  const result = await client.query(
    `UPDATE ${table}
     SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL${whereExtra}
     RETURNING id`,
    params
  );

  return result.rows.length > 0;
}

/**
 * Restore a soft-deleted record.
 */
export async function softRestore(
  client: PoolClient,
  table: string,
  id: string,
  extraWhere?: { column: string; value: string }
): Promise<boolean> {
  assertValidTable(table);
  if (extraWhere) assertValidColumn(extraWhere.column);

  const whereExtra = extraWhere ? ` AND ${extraWhere.column} = $2` : '';
  const params = extraWhere ? [id, extraWhere.value] : [id];

  const result = await client.query(
    `UPDATE ${table}
     SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NOT NULL${whereExtra}
     RETURNING id`,
    params
  );

  return result.rows.length > 0;
}

// ============================================================================
// Storage Decrement on Delete
// ============================================================================

/**
 * Decrement society's storage_used_bytes when content is deleted.
 * Uses FOR UPDATE to prevent race conditions.
 */
export async function decrementStorageUsed(
  client: PoolClient,
  societyId: string,
  bytes: number
): Promise<void> {
  if (bytes <= 0) return;

  await client.query(
    `UPDATE society_settings
     SET storage_used_bytes = GREATEST(0, storage_used_bytes - $2),
         updated_at = NOW()
     WHERE society_id = $1`,
    [societyId, bytes]
  );
}

/**
 * Calculate and fix storage_used_bytes from actual media records.
 * Used for data recovery/integrity checks.
 */
export async function recalculateStorageUsed(
  societyId: string,
  client?: PoolClient
): Promise<number> {
  const q = client ? client.query.bind(client) : query;

  const result = await q(
    `SELECT COALESCE(SUM(file_size_bytes), 0) AS total_bytes FROM (
       SELECT file_size_bytes FROM society_media WHERE society_id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT file_size_bytes FROM society_album_photos WHERE society_id = $1 AND deleted_at IS NULL AND is_deleted = FALSE
       UNION ALL
       SELECT spi.file_size_bytes FROM society_post_images spi
         JOIN society_posts sp ON spi.post_id = sp.id
         WHERE sp.society_id = $1 AND sp.deleted_at IS NULL AND sp.is_deleted = FALSE AND spi.deleted_at IS NULL
     ) AS all_media`,
    [societyId]
  );

  const totalBytes = parseInt(result.rows[0].total_bytes);

  await (q as typeof query)(
    `UPDATE society_settings SET storage_used_bytes = $2, updated_at = NOW() WHERE society_id = $1`,
    [societyId, totalBytes]
  );

  return totalBytes;
}
