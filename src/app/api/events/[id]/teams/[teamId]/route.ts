export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable } from '@/lib/rbac';
import { loadTeam, cleanText } from '@/lib/event-workspace';

/** PATCH /api/events/[id]/teams/[teamId] { is_active?, notes? } — MANAGE_TEAMS. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; teamId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.manageTeams(access)) return forbidden('You do not have permission to manage event teams.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const team = await loadTeam(params.id, params.teamId);
    if (!team) return ApiErrors.notFound('Team');

    const body = await req.json().catch(() => ({}));
    const isActive = typeof body.is_active === 'boolean' ? body.is_active : team.is_active;
    const notes = body.notes !== undefined ? cleanText(body.notes, 2000) : undefined;

    if (!isActive && team.is_active) {
      const open = await query(
        `SELECT
           (SELECT COUNT(*) FROM duties WHERE team_id = $1 AND deleted_at IS NULL AND status <> 'DONE')::int AS duties,
           (SELECT COUNT(*) FROM inventory_requests WHERE team_id = $1 AND status IN ('APPROVED', 'ISSUED'))::int AS items`,
        [team.id],
      );
      if (open.rows[0].duties > 0 || open.rows[0].items > 0) {
        return ApiErrors.conflict('This team still has open duties or issued items. Close them first.');
      }
    }

    await query(
      `UPDATE event_teams SET is_active = $2, notes = COALESCE($3, notes), updated_at = NOW() WHERE id = $1`,
      [team.id, isActive, notes ?? null],
    );
    await writeAuditLog({
      action: isActive ? 'EVENT_TEAM_ACTIVATED' : 'EVENT_TEAM_DEACTIVATED',
      performedBy: user.userId,
      societyId: team.society_id,
      targetType: 'event_team',
      targetId: team.id,
      metadata: { event_id: params.id, portfolio: team.portfolio_name },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Update team error:', error);
  }
}
