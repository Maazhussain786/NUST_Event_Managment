export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable } from '@/lib/rbac';
import { isUuid } from '@/lib/event-workspace';
import { validateDuty } from '@/lib/duties';
import { notifyUser } from '@/lib/notify';

const STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'];

async function loadDuty(eventId: string, dutyId: string) {
  if (!isUuid(dutyId)) return null;
  const r = await query(
    `SELECT id, society_id, team_id, title, description, location, starts_at, ends_at, assignee_id, assigned_by, status
     FROM duties WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL`,
    [dutyId, eventId],
  );
  return r.rows[0] ?? null;
}

/**
 * PATCH /api/events/[id]/duties/[dutyId]
 *   { status }              — the assignee (FR-DUTY-04) or a duty manager
 *   { title, assignee_id, … } — duty managers (team's Team Lead, Event Head, Admins)
 * Changes are notified to the people concerned (FR-DUTY-05).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; dutyId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const duty = await loadDuty(params.id, params.dutyId);
    if (!duty) return ApiErrors.notFound('Duty');
    const canManage = rules.manageDutiesFor(access, duty.team_id);
    const body = await req.json().catch(() => ({}));
    const contentKeys = ['title', 'description', 'location', 'starts_at', 'ends_at', 'assignee_id', 'team_id'];
    const editsContent = contentKeys.some((k) => body[k] !== undefined);

    if (editsContent) {
      if (!canManage) return forbidden('Only the Team Lead, Event Head or an Admin can edit this duty.');
      const input = await validateDuty(params.id, {
        title: body.title ?? duty.title,
        description: body.description !== undefined ? body.description : duty.description,
        location: body.location !== undefined ? body.location : duty.location,
        starts_at: body.starts_at !== undefined ? body.starts_at : duty.starts_at,
        ends_at: body.ends_at !== undefined ? body.ends_at : duty.ends_at,
        assignee_id: body.assignee_id ?? duty.assignee_id,
        team_id: body.team_id !== undefined ? body.team_id : duty.team_id,
      });
      if ('error' in input) return input.error;
      if (!rules.manageDutiesFor(access, input.team_id)) return forbidden('You cannot move this duty to that team.');

      await query(
        `UPDATE duties SET title = $2, description = $3, location = $4, starts_at = $5, ends_at = $6,
                assignee_id = $7, team_id = $8, updated_at = NOW()
         WHERE id = $1`,
        [duty.id, input.title, input.description, input.location, input.starts_at, input.ends_at, input.assignee_id, input.team_id],
      );
      await writeAuditLog({
        action: 'DUTY_UPDATED',
        performedBy: user.userId,
        societyId: duty.society_id,
        targetType: 'duty',
        targetId: duty.id,
        oldValue: { title: duty.title, assignee_id: duty.assignee_id, starts_at: duty.starts_at },
        newValue: { title: input.title, assignee_id: input.assignee_id, starts_at: input.starts_at },
      });
      const link = '/my-work';
      if (input.assignee_id !== duty.assignee_id) {
        await notifyUser(input.assignee_id, { title: `New duty: ${input.title}`, body: `You were assigned "${input.title}" for ${access.event.title}.`, link, email: true });
        await notifyUser(duty.assignee_id, { title: `Duty reassigned: ${duty.title}`, body: `"${duty.title}" was given to someone else.`, link });
      } else if (input.assignee_id !== user.userId) {
        await notifyUser(input.assignee_id, { title: `Duty changed: ${input.title}`, body: `Details of "${input.title}" for ${access.event.title} were updated.`, link, email: true });
      }
    }

    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (!STATUSES.includes(status)) return ApiErrors.validation('Status must be PENDING, IN_PROGRESS or DONE');
      if (duty.assignee_id !== user.userId && !canManage) return forbidden('Only the assignee can update this duty\'s status.');
      if (status !== duty.status) {
        await query(
          `UPDATE duties SET status = $2, status_updated_at = NOW(), status_updated_by = $3, updated_at = NOW() WHERE id = $1`,
          [duty.id, status, user.userId],
        );
        await writeAuditLog({
          action: 'DUTY_STATUS_CHANGED',
          performedBy: user.userId,
          societyId: duty.society_id,
          targetType: 'duty',
          targetId: duty.id,
          oldValue: { status: duty.status },
          newValue: { status },
        });
        if (duty.assigned_by !== user.userId) {
          await notifyUser(duty.assigned_by, {
            title: `Duty ${status === 'DONE' ? 'completed' : 'updated'}: ${duty.title}`,
            body: `${user.fullName} marked "${duty.title}" as ${status.replace('_', ' ').toLowerCase()}.`,
            link: `/society/${duty.society_id}/events/${params.id}/workspace?tab=duties`,
            push: false,
          });
        }
      }
    }

    if (!editsContent && body.status === undefined) return ApiErrors.validation('Nothing to update');
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Update duty error:', error);
  }
}

// DELETE /api/events/[id]/duties/[dutyId] — remove a duty (duty managers)
export async function DELETE(req: NextRequest, { params }: { params: { id: string; dutyId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');
    const duty = await loadDuty(params.id, params.dutyId);
    if (!duty) return ApiErrors.notFound('Duty');
    if (!rules.manageDutiesFor(access, duty.team_id)) return forbidden('You cannot remove this duty.');

    await query('UPDATE duties SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [duty.id]);
    await writeAuditLog({
      action: 'DUTY_REMOVED',
      performedBy: user.userId,
      societyId: duty.society_id,
      targetType: 'duty',
      targetId: duty.id,
      oldValue: { title: duty.title, assignee_id: duty.assignee_id },
    });
    if (duty.assignee_id !== user.userId) {
      await notifyUser(duty.assignee_id, { title: `Duty cancelled: ${duty.title}`, body: `"${duty.title}" was removed.`, link: '/my-work' });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Delete duty error:', error);
  }
}
