export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import {
  requireEventWorkspace, rules, leadsTeam, forbidden, eventIsEditable,
  ensureSocietyMember, setChangeContext, RbacError, TEAM_ROLE_LABELS, type TeamRole,
} from '@/lib/rbac';
import { loadTeam, resolveActiveUser } from '@/lib/event-workspace';
import { notifyUser } from '@/lib/notify';

/**
 * POST /api/events/[id]/teams/[teamId]/members { user_id | email, team_role, reason }
 *   Team Lead   — assigned by MANAGE_TEAMS holders (FR-ROLE-04 direct assignment)
 *   Executive   — added by the team's Team Lead or MANAGE_TEAMS holders (FR-TEAM-05)
 * The person becomes a society Member automatically if they aren't one yet.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; teamId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const teamRole = String(body.team_role || 'EXECUTIVE').toUpperCase() as TeamRole;
    const reason = String(body.reason || '').trim() || null;
    if (teamRole !== 'TEAM_LEAD' && teamRole !== 'EXECUTIVE') return ApiErrors.validation('team_role must be TEAM_LEAD or EXECUTIVE');

    const team = await loadTeam(params.id, params.teamId);
    if (!team || !team.is_active) return ApiErrors.notFound('Active team');

    const allowed = teamRole === 'TEAM_LEAD'
      ? rules.manageTeams(access)
      : rules.manageTeams(access) || leadsTeam(access, team.id);
    if (!allowed) return forbidden(teamRole === 'TEAM_LEAD'
      ? 'Only Admins (Manage teams) can assign Team Leads.'
      : 'Only this team\'s Team Lead or an Admin can add Executives.');

    const person = await resolveActiveUser(body);
    if (!person) return ApiErrors.validation('No active account found for that person. They must sign up first.');

    await client.query('BEGIN');
    await setChangeContext(client, { actorId: user.userId, reason: reason ?? `Added as ${TEAM_ROLE_LABELS[teamRole]}`, source: 'DIRECT' });
    await ensureSocietyMember(client, team.society_id, person.id, user.userId);

    const existing = await client.query(
      `SELECT id, team_role FROM event_team_members WHERE team_id = $1 AND user_id = $2 AND removed_at IS NULL FOR UPDATE`,
      [team.id, person.id],
    );
    let memberId: string;
    if (existing.rows[0]) {
      if (existing.rows[0].team_role === teamRole) {
        await client.query('ROLLBACK');
        return ApiErrors.conflict(`${person.full_name} is already ${TEAM_ROLE_LABELS[teamRole]} of this team.`);
      }
      if (!rules.manageTeams(access)) {
        await client.query('ROLLBACK');
        return forbidden('Only Admins can change a team role.');
      }
      await client.query('UPDATE event_team_members SET team_role = $2, assigned_by = $3 WHERE id = $1', [
        existing.rows[0].id, teamRole, user.userId,
      ]);
      memberId = existing.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO event_team_members (team_id, event_id, society_id, user_id, team_role, source, assigned_by)
         VALUES ($1, $2, $3, $4, $5, 'DIRECT', $6) RETURNING id`,
        [team.id, params.id, team.society_id, person.id, teamRole, user.userId],
      );
      memberId = inserted.rows[0].id;
    }

    await writeAuditLog(
      {
        action: 'TEAM_MEMBER_ASSIGNED',
        performedBy: user.userId,
        societyId: team.society_id,
        targetType: 'event_team_member',
        targetId: memberId,
        newValue: { user_id: person.id, team_role: teamRole, team: team.portfolio_name },
        metadata: { event_id: params.id, reason },
      },
      client,
    );
    await client.query('COMMIT');

    await notifyUser(person.id, {
      title: `You are ${TEAM_ROLE_LABELS[teamRole]} of ${team.portfolio_name}`,
      body: `You were added to the ${team.portfolio_name} team of "${access.event.title}" as ${TEAM_ROLE_LABELS[teamRole]}.`,
      link: `/society/${team.society_id}/events/${params.id}/workspace`,
      email: true,
    });
    return NextResponse.json({ success: true, member_id: memberId }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof RbacError) return ApiErrors.conflict(error.message);
    return ApiErrors.serverError('Add team member error:', error);
  } finally {
    client.release();
  }
}
