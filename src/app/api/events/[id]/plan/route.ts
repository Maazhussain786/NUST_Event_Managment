export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable, setChangeContext } from '@/lib/rbac';
import { validatePlanInput, notifyPlanChange } from '@/lib/event-plan';

/**
 * Event plan: days, venues and time slots per activity (FR-EVT-04).
 * Visible to everyone on the event; edited by Admins (MANAGE_EVENT_PLAN) and the Event Head.
 * Every change is recorded automatically in event_plan_changes (FR-EVT-05).
 */

// GET /api/events/[id]/plan — plan items + recent change history
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;

    const [items, changes] = await Promise.all([
      query(
        `SELECT pi.id, pi.day_date, pi.start_time, pi.end_time, pi.title, pi.venue, pi.description,
                pi.team_id, p.name AS team_name, pi.updated_at, u.full_name AS updated_by_name
         FROM event_plan_items pi
         LEFT JOIN event_teams et ON et.id = pi.team_id
         LEFT JOIN portfolios p ON p.id = et.portfolio_id
         LEFT JOIN users u ON u.id = COALESCE(pi.updated_by, pi.created_by)
         WHERE pi.event_id = $1 AND pi.deleted_at IS NULL
         ORDER BY pi.day_date, pi.start_time, pi.title`,
        [params.id],
      ),
      query(
        `SELECT c.id, c.plan_item_id, c.action, c.old_value, c.new_value, c.created_at, u.full_name AS changed_by_name
         FROM event_plan_changes c LEFT JOIN users u ON u.id = c.changed_by
         WHERE c.event_id = $1
         ORDER BY c.created_at DESC
         LIMIT 100`,
        [params.id],
      ),
    ]);
    return NextResponse.json({ items: items.rows, changes: changes.rows, can_edit: rules.editPlan(access) && eventIsEditable(access) });
  } catch (error) {
    return ApiErrors.serverError('Event plan error:', error);
  }
}

// POST /api/events/[id]/plan — add a plan item
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.editPlan(access)) return forbidden('Only Admins and the Event Head can edit the plan.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const input = await validatePlanInput(params.id, await req.json().catch(() => ({})));
    if ('error' in input) return input.error;

    await client.query('BEGIN');
    await setChangeContext(client, { actorId: user.userId });
    const inserted = await client.query(
      `INSERT INTO event_plan_items (event_id, society_id, day_date, start_time, end_time, title, venue, description, team_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [params.id, access.event.society_id, input.day_date, input.start_time, input.end_time,
        input.title, input.venue, input.description, input.team_id, user.userId],
    );
    await client.query('COMMIT');

    await notifyPlanChange(access, user.userId, `Added "${input.title}" on ${input.day_date} at ${input.start_time}.`);
    return NextResponse.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Add plan item error:', error);
  } finally {
    client.release();
  }
}
