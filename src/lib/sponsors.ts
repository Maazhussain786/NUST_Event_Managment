import { query } from './db';
import type { JWTPayload } from './auth';
import { getSocietyAccess, can, FUNCTION, type SocietyAccess } from './rbac';

/**
 * Society-level sponsor access (SRS 4.11, matrix 8.1):
 *   manage: MANAGE_SPONSORS, or a member of an Outreach/Sponsors team in a live event
 *   view:   VIEW_SPONSORS / MANAGE_SPONSORS, Outreach or Finance team members, Event Heads
 */
export interface SponsorAccess {
  society: SocietyAccess;
  canManage: boolean;
  canView: boolean;
}

export async function getSponsorAccess(user: JWTPayload, societyId: string): Promise<SponsorAccess | null> {
  const society = await getSocietyAccess(user, societyId);
  if (!society) return null;
  if (!society.isMember && !society.isSuperAdmin) return { society, canManage: false, canView: false };

  const functions = await query(
    `SELECT DISTINCT p.function_key
     FROM event_team_members etm
     JOIN event_teams et ON et.id = etm.team_id AND et.is_active
     JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL AND e.archived_at IS NULL
     JOIN portfolios p ON p.id = et.portfolio_id
     WHERE etm.society_id = $1 AND etm.user_id = $2 AND etm.removed_at IS NULL`,
    [societyId, user.userId],
  );
  const keys = new Set(functions.rows.map((r: { function_key: string }) => r.function_key));
  const headsEvent = await query(
    `SELECT 1 FROM events WHERE society_id = $1 AND event_head_id = $2 AND deleted_at IS NULL AND archived_at IS NULL LIMIT 1`,
    [societyId, user.userId],
  );

  const canManage = can(society, 'MANAGE_SPONSORS') || keys.has(FUNCTION.OUTREACH);
  const canView = canManage || can(society, 'VIEW_SPONSORS') || keys.has(FUNCTION.FINANCE) || headsEvent.rows.length > 0;
  return { society, canManage, canView };
}

export const INTERACTION_TYPES = ['CALL', 'EMAIL', 'MEETING', 'PROPOSAL', 'OFFER', 'FOLLOW_UP', 'OTHER'] as const;
export const SPONSORSHIP_STATUSES = ['PROPOSED', 'CONFIRMED', 'RECEIVED', 'DECLINED'] as const;
export const DELIVERABLE_STATUSES = ['PENDING', 'IN_PROGRESS', 'DELIVERED'] as const;
