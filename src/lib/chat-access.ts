import { query } from './db';
import { can, isSocietyAdmin, type SocietyAccess } from './rbac';

/**
 * Chat rules (PRD 10.2-10.4):
 *  - society-wide channels: every member with VIEW_CHAT
 *  - wing / portfolio channels: only people in that wing / portfolio
 *    (society assignment or an event team of that portfolio), plus chat managers
 *  - OPEN: anyone who can see the channel and holds SEND_MESSAGE may post
 *  - RESTRICTED: chat managers, or roles granted SEND_MESSAGE on that channel
 *  - ANNOUNCEMENT_ONLY: chat managers only
 */
export interface ChatRow {
  id: string;
  society_id: string;
  wing_id: string | null;
  portfolio_id: string | null;
  mode: 'OPEN' | 'RESTRICTED' | 'ANNOUNCEMENT_ONLY';
  is_active: boolean;
}

export function managesChat(access: SocietyAccess): boolean {
  return isSocietyAdmin(access) || can(access, 'MANAGE_CHAT');
}

/** SQL condition (on alias `c`) limiting chats to those the user ($1) may see in society ($2). */
export const VISIBLE_CHAT_CONDITION = `
  (
    (c.wing_id IS NULL AND c.portfolio_id IS NULL)
    OR EXISTS (
      SELECT 1 FROM society_memberships sm
      WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active AND sm.suspended_at IS NULL
        AND ((c.portfolio_id IS NOT NULL AND sm.portfolio_id = c.portfolio_id)
          OR (c.portfolio_id IS NULL AND sm.wing_id = c.wing_id))
    )
    OR (c.portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM event_team_members etm
      JOIN event_teams et ON et.id = etm.team_id
      WHERE etm.user_id = $1 AND etm.removed_at IS NULL AND et.portfolio_id = c.portfolio_id
    ))
    OR (c.portfolio_id IS NULL AND c.wing_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM portfolios p
      JOIN event_teams et ON et.portfolio_id = p.id
      JOIN event_team_members etm ON etm.team_id = et.id AND etm.removed_at IS NULL AND etm.user_id = $1
      WHERE p.wing_id = c.wing_id
    ))
  )`;

export async function canViewChat(access: SocietyAccess, chat: ChatRow): Promise<boolean> {
  if (managesChat(access)) return true;
  if (!can(access, 'VIEW_CHAT')) return false;
  if (!chat.wing_id && !chat.portfolio_id) return true;
  const result = await query(
    `SELECT 1 FROM chats c WHERE c.id = $3 AND ${VISIBLE_CHAT_CONDITION}`,
    [access.userId, access.societyId, chat.id],
  );
  return result.rows.length > 0;
}

/** Returns null when the user may post, otherwise the reason they may not. */
export async function sendBlockReason(access: SocietyAccess, chat: ChatRow): Promise<string | null> {
  if (!chat.is_active) return 'This channel is archived.';
  if (!(await canViewChat(access, chat))) return 'You cannot access this channel.';
  if (managesChat(access)) return null;
  if (!can(access, 'SEND_MESSAGE')) return 'You do not have permission to send messages.';
  if (chat.mode === 'ANNOUNCEMENT_ONLY') return 'Only channel managers can post in announcement channels.';
  if (chat.mode === 'RESTRICTED') {
    const allowed = access.roleId
      ? await query(
          `SELECT 1 FROM chat_role_permissions
           WHERE chat_id = $1 AND role_id = $2 AND permission = 'SEND_MESSAGE'`,
          [chat.id, access.roleId],
        )
      : { rows: [] };
    if (allowed.rows.length === 0) return 'Only selected roles can post in this channel.';
  }
  return null;
}
