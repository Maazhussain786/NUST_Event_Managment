import type { PoolClient } from 'pg';
import { query } from './db';
import { normalizeEmail } from './email-policy';

/** Shared helpers for the per-event workspace routes (teams, plan, duties, finance, ...). */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export interface TeamRow {
  id: string;
  society_id: string;
  event_id: string;
  portfolio_id: string;
  portfolio_name: string;
  function_key: string;
  is_active: boolean;
}

export async function loadTeam(eventId: string, teamId: string, client?: PoolClient): Promise<TeamRow | null> {
  if (!isUuid(teamId)) return null;
  const run = client ? client.query.bind(client) : query;
  const result = await run(
    `SELECT et.id, et.society_id, et.event_id, et.portfolio_id, et.is_active,
            p.name AS portfolio_name, p.function_key
     FROM event_teams et JOIN portfolios p ON p.id = et.portfolio_id
     WHERE et.id = $1 AND et.event_id = $2`,
    [teamId, eventId],
  );
  return result.rows[0] ?? null;
}

/** Finds an ACTIVE account by id or email (body.user_id / body.email). */
export async function resolveActiveUser(
  ref: { user_id?: unknown; email?: unknown },
  client?: PoolClient,
): Promise<{ id: string; full_name: string; email: string } | null> {
  const run = client ? client.query.bind(client) : query;
  if (isUuid(ref.user_id)) {
    const r = await run(`SELECT id, full_name, email FROM users WHERE id = $1 AND status = 'ACTIVE'`, [ref.user_id]);
    return r.rows[0] ?? null;
  }
  const email = normalizeEmail(String(ref.email || ''));
  if (!email) return null;
  const r = await run(`SELECT id, full_name, email FROM users WHERE email = $1 AND status = 'ACTIVE'`, [email]);
  return r.rows[0] ?? null;
}

export function parseMoney(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function parseDateOnly(value: unknown): string | null {
  const s = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

export function parseTime(value: unknown): string | null {
  const s = String(value || '');
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s) ? s.slice(0, 5) : null;
}

export function parseTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function cleanText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

/** Turns rows into CSV text (RFC 4180 quoting; formula-injection safe for spreadsheets). */
export function toCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(',')).join('\r\n');
  return `${header}\r\n${body}\r\n`;
}
