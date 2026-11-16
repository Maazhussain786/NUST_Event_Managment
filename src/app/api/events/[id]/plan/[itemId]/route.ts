export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable, setChangeContext } from '@/lib/rbac';
import { validatePlanInput, notifyPlanChange } from '@/lib/event-plan';
import { isUuid } from '@/lib/event-workspace';

async function loadItem(eventId: string, itemId: string) {
  if (!isUuid(itemId)) return null;
  const result = await query(
    `SELECT id, day_date, start_time, end_time, title, venue, description, team_id
     FROM event_plan_items WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL`,
    [itemId, eventId],
  );
  return result.rows[0] ?? null;
}

// PATCH /api/events/[id]/plan/[itemId] — edit a plan item (send the full item)
export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.editPlan(access)) return forbidden('Only Admins and the Event Head can edit the plan.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const item = await loadItem(params.id, params.itemId);
    if (!item) return ApiErrors.notFound('Plan item');
    const body = await req.json().catch(() => ({}));
    const input = await validatePlanInput(params.id, {
      day_date: body.day_date ?? (item.day_date instanceof Date ? item.day_date.toISOString().slice(0, 10) : item.day_date),
      start_time: body.start_time ?? String(item.start_time).slice(0, 5),
      end_time: body.end_time ?? String(item.end_time).slice(0, 5),
      title: body.title ?? item.title,
      venue: body.venue !== undefined ? body.venue : item.venue,
      description: body.description !== undefined ? body.description : item.description,
      team_id: body.team_id !== undefined ? body.team_id : item.team_id,
    });
    if ('error' in input) return input.error;

    await client.query('BEGIN');
    await setChangeContext(client, { actorId: user.userId });
    await client.query(
      `UPDATE event_plan_items
       SET day_date = $2, start_time = $3, end_time = $4, title = $5, venue = $6, description = $7,
           team_id = $8, updated_by = $9, updated_at = NOW()
       WHERE id = $1`,
      [item.id, input.day_date, input.start_time, input.end_time, input.title, input.venue,
        input.description, input.team_id, user.userId],
    );
    await client.query('COMMIT');

    await notifyPlanChange(access, user.userId, `Changed "${input.title}" (${input.day_date} ${input.start_time}-${input.end_time}${input.venue ? `, ${input.venue}` : ''}).`);
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Edit plan item error:', error);
  } finally {
    client.release();
  }
}

// DELETE /api/events/[id]/plan/[itemId] — remove a plan item (soft delete, kept in history)
export async function DELETE(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.editPlan(access)) return forbidden('Only Admins and the Event Head can edit the plan.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const item = await loadItem(params.id, params.itemId);
    if (!item) return ApiErrors.notFound('Plan item');

    await client.query('BEGIN');
    await setChangeContext(client, { actorId: user.userId });
    await client.query(
      'UPDATE event_plan_items SET deleted_at = NOW(), updated_by = $2, updated_at = NOW() WHERE id = $1',
      [item.id, user.userId],
    );
    await client.query('COMMIT');

    await notifyPlanChange(access, user.userId, `Removed "${item.title}" from the plan.`);
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Delete plan item error:', error);
  } finally {
    client.release();
  }
}
