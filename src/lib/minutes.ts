import type { NextResponse } from 'next/server';
import { query } from './db';
import { ApiErrors } from './api-utils';
import type { JWTPayload } from './auth';
import { getSocietyAccess, getEventAccess, can, isSocietyAdmin, rules, type SocietyAccess } from './rbac';
import { cleanText, isUuid, parseDateOnly } from './event-workspace';

/** Minutes sheets (FR-MIN-01..06). */

export interface MinutesRow {
  id: string;
  society_id: string;
  event_id: string | null;
  team_id: string | null;
  title: string;
  status: string;
  created_by: string;
  locked_at: string | null;
  deleted_at: string | null;
}

export async function isPrincipal(userId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM users WHERE id = $1 AND designation = 'PRINCIPAL' AND status = 'ACTIVE'`, [userId]);
  return r.rows.length > 0;
}

/** May see every (non-draft) minutes sheet of the society. */
export function seesAllMinutes(access: SocietyAccess): boolean {
  return isSocietyAdmin(access) || can(access, 'APPROVE_MINUTES') || can(access, 'REVIEW_MINUTES') || can(access, 'CREATE_MINUTES');
}

/**
 * SQL condition (alias m) for minutes the user ($1) may read in a society when they do
 * not see all: their own, their teams', and events they head. Drafts stay private to the author.
 */
export const OWN_MINUTES_CONDITION = `(
  m.created_by = $1
  OR (m.status <> 'DRAFT' AND m.team_id IN (SELECT team_id FROM event_team_members WHERE user_id = $1 AND removed_at IS NULL))
  OR (m.status <> 'DRAFT' AND m.event_id IN (SELECT id FROM events WHERE event_head_id = $1))
)`;

export async function canReadMinutes(user: JWTPayload, access: SocietyAccess, m: MinutesRow): Promise<boolean> {
  if (m.created_by === user.userId) return true;
  if (m.status === 'DRAFT') return false;
  if (seesAllMinutes(access)) return true;
  if (m.status === 'FORWARDED' || m.status.startsWith('PRINCIPAL_')) {
    if (await isPrincipal(user.userId)) return true;
  }
  const r = await query(`SELECT 1 FROM minutes_sheets m WHERE m.id = $2 AND ${OWN_MINUTES_CONDITION}`, [user.userId, m.id]);
  return r.rows.length > 0;
}

export interface MinutesInput {
  title: string;
  meeting_date: string;
  venue: string | null;
  attendees: string[];
  agenda: string;
  decisions: string;
  action_items: Array<{ task: string; owner: string | null; due: string | null }>;
}

export function validateMinutesContent(body: Record<string, unknown>): MinutesInput | { error: NextResponse } {
  const title = cleanText(body.title, 300);
  if (!title) return { error: ApiErrors.validation('Title is required') };
  const date = parseDateOnly(body.meeting_date);
  if (!date) return { error: ApiErrors.validation('Meeting date must be YYYY-MM-DD') };
  const attendees = (Array.isArray(body.attendees) ? body.attendees : String(body.attendees || '').split(/\n|,/))
    .map((a) => String(a).trim()).filter(Boolean).slice(0, 200).map((a) => a.slice(0, 200));
  const actionItems = (Array.isArray(body.action_items) ? body.action_items : [])
    .slice(0, 100)
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        task: cleanText(item.task, 500) ?? '',
        owner: cleanText(item.owner, 200),
        due: parseDateOnly(item.due),
      };
    })
    .filter((i) => i.task);
  return {
    title,
    meeting_date: date,
    venue: cleanText(body.venue, 300),
    attendees,
    agenda: cleanText(body.agenda, 20000) ?? '',
    decisions: cleanText(body.decisions, 20000) ?? '',
    action_items: actionItems,
  };
}

/**
 * Who may create minutes for an (optional) event/team: CREATE_MINUTES holders,
 * the Event Head, or the team's Team Lead (FR-MIN-01). Society-level minutes need CREATE_MINUTES or Admin.
 */
export async function canCreateMinutes(
  user: JWTPayload,
  societyId: string,
  eventId: string | null,
  teamId: string | null,
): Promise<{ ok: true; access: SocietyAccess } | { ok: false; error: NextResponse }> {
  const access = await getSocietyAccess(user, societyId);
  if (!access) return { ok: false, error: ApiErrors.notFound('Society') };
  if (!eventId) {
    if (teamId) return { ok: false, error: ApiErrors.validation('Choose the event the team belongs to') };
    return can(access, 'CREATE_MINUTES') ? { ok: true, access } : { ok: false, error: ApiErrors.forbidden('Only Admins or Officers with "Create minutes" can write society-level minutes.') };
  }
  if (!isUuid(eventId)) return { ok: false, error: ApiErrors.validation('Invalid event') };
  const eventAccess = await getEventAccess(user, eventId);
  if (!eventAccess || eventAccess.event.society_id !== societyId || eventAccess.event.deleted_at) {
    return { ok: false, error: ApiErrors.validation('Event not found in this society') };
  }
  if (teamId) {
    const team = await query('SELECT 1 FROM event_teams WHERE id = $1 AND event_id = $2', [teamId, eventId]);
    if (team.rows.length === 0) return { ok: false, error: ApiErrors.validation('That team is not part of the event') };
  }
  return rules.createMinutesFor(eventAccess, teamId)
    ? { ok: true, access }
    : { ok: false, error: ApiErrors.forbidden('Only the Team Lead, Event Head or an Admin can write these minutes.') };
}
