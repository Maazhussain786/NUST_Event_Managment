export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable } from '@/lib/rbac';
import { isUuid } from '@/lib/event-workspace';
import { validateDuty } from '@/lib/duties';
import { notifyUser } from '@/lib/notify';

/**
 * Duties (FR-DUTY-01..05)
 *   Admins / Event Head: all duties of the event        (FR-DUTY-03)
 *   Team members:        every duty of their own teams   (FR-DUTY-02)
 *   Everyone:            duties assigned to them
 */

// GET /api/events/[id]/duties?team_id=&mine=1
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;

    const seeAll = rules.viewAllDuties(access);
    const myTeams = access.teams.map((t) => t.teamId);
    const teamFilter = req.nextUrl.searchParams.get('team_id');
    const mineOnly = req.nextUrl.searchParams.get('mine') === '1';

    const result = await query(
      `SELECT d.id, d.team_id, p.name AS team_name, d.title, d.description, d.location, d.starts_at, d.ends_at,
              d.status, d.status_updated_at, d.created_at, d.updated_at,
              d.assignee_id, au.full_name AS assignee_name, d.assigned_by, bu.full_name AS assigned_by_name
       FROM duties d
       JOIN users au ON au.id = d.assignee_id
       JOIN users bu ON bu.id = d.assigned_by
       LEFT JOIN event_teams et ON et.id = d.team_id
       LEFT JOIN portfolios p ON p.id = et.portfolio_id
       WHERE d.event_id = $1 AND d.deleted_at IS NULL
         AND ($2::boolean OR d.team_id = ANY($3::uuid[]) OR d.assignee_id = $4)
         AND ($5::uuid IS NULL OR d.team_id = $5)
         AND ($6::boolean = FALSE OR d.assignee_id = $4)
       ORDER BY d.starts_at NULLS LAST, d.created_at`,
      [params.id, seeAll, myTeams, user.userId, isUuid(teamFilter) ? teamFilter : null, mineOnly],
    );

    const managed = new Set(
      seeAll || rules.manageDutiesFor(access, null)
        ? result.rows.map((d) => d.id)
        : result.rows.filter((d) => d.team_id && rules.manageDutiesFor(access, d.team_id)).map((d) => d.id),
    );
    return NextResponse.json({
      duties: result.rows.map((d) => ({
        ...d,
        can_edit: managed.has(d.id) && eventIsEditable(access),
        can_update_status: (d.assignee_id === user.userId || managed.has(d.id)) && eventIsEditable(access),
      })),
      can_create_for_any_team: rules.manageDutiesFor(access, null),
      creatable_team_ids: access.teams.filter((t) => t.teamRole === 'TEAM_LEAD').map((t) => t.teamId),
    });
  } catch (error) {
    return ApiErrors.serverError('Duties list error:', error);
  }
}

// POST /api/events/[id]/duties { title, description?, location?, starts_at?, ends_at?, assignee_id, team_id? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const input = await validateDuty(params.id, body);
    if ('error' in input) return input.error;
    if (!rules.manageDutiesFor(access, input.team_id)) {
      return forbidden('You can only assign duties within your own team.');
    }

    const inserted = await query(
      `INSERT INTO duties (society_id, event_id, team_id, title, description, location, starts_at, ends_at, assignee_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [access.event.society_id, params.id, input.team_id, input.title, input.description, input.location,
        input.starts_at, input.ends_at, input.assignee_id, user.userId],
    );
    await writeAuditLog({
      action: 'DUTY_ASSIGNED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'duty',
      targetId: inserted.rows[0].id,
      newValue: { title: input.title, assignee_id: input.assignee_id, team_id: input.team_id },
    });

    if (input.assignee_id !== user.userId) {
      const when = input.starts_at
        ? ` on ${new Date(input.starts_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })}`
        : '';
      await notifyUser(input.assignee_id, {
        title: `New duty: ${input.title}`,
        body: `${user.fullName} assigned you "${input.title}" for ${access.event.title}${when}${input.location ? ` at ${input.location}` : ''}.`,
        link: `/my-work`,
        email: true,
      });
    }
    return NextResponse.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Create duty error:', error);
  }
}
