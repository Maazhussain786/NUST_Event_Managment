export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, leadsTeam, forbidden, setChangeContext, TEAM_ROLE_LABELS } from '@/lib/rbac';
import { isUuid } from '@/lib/event-workspace';
import { notifyUser } from '@/lib/notify';

/**
 * DELETE /api/events/[id]/teams/[teamId]/members/[memberId]?reason=...
 * Admins (MANAGE_TEAMS) may remove anyone; a Team Lead may remove Executives of their own team.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string; teamId: string; memberId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    if (!isUuid(params.memberId)) return ApiErrors.notFound('Team member');
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    const reason = (req.nextUrl.searchParams.get('reason') || '').trim() || null;

    await client.query('BEGIN');
    const member = await client.query(
      `SELECT etm.id, etm.user_id, etm.team_role, etm.society_id, p.name AS portfolio_name
       FROM event_team_members etm
       JOIN event_teams et ON et.id = etm.team_id
       JOIN portfolios p ON p.id = et.portfolio_id
       WHERE etm.id = $1 AND etm.team_id = $2 AND etm.event_id = $3 AND etm.removed_at IS NULL
       FOR UPDATE OF etm`,
      [params.memberId, params.teamId, params.id],
    );
    const row = member.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Team member');
    }
    const allowed = rules.manageTeams(access)
      || (row.team_role === 'EXECUTIVE' && leadsTeam(access, params.teamId) && row.user_id !== user.userId);
    if (!allowed) {
      await client.query('ROLLBACK');
      return forbidden('You cannot remove this person from the team.');
    }

    await setChangeContext(client, { actorId: user.userId, reason: reason ?? 'Removed from team', source: 'DIRECT' });
    await client.query(
      `UPDATE event_team_members SET removed_at = NOW(), removed_by = $2, removal_reason = $3 WHERE id = $1`,
      [row.id, user.userId, reason],
    );
    await writeAuditLog(
      {
        action: 'TEAM_MEMBER_REMOVED',
        performedBy: user.userId,
        societyId: row.society_id,
        targetType: 'event_team_member',
        targetId: row.id,
        oldValue: { user_id: row.user_id, team_role: row.team_role },
        metadata: { event_id: params.id, reason },
      },
      client,
    );
    await client.query('COMMIT');

    await notifyUser(row.user_id, {
      title: `Removed from ${row.portfolio_name}`,
      body: `You are no longer ${TEAM_ROLE_LABELS[row.team_role as 'TEAM_LEAD' | 'EXECUTIVE']} of ${row.portfolio_name} for "${access.event.title}".${reason ? ` Reason: ${reason}` : ''}`,
      link: `/society/${row.society_id}/dashboard`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Remove team member error:', error);
  } finally {
    client.release();
  }
}
