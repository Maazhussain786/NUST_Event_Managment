export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { getSocietyAccess, can, forbidden } from '@/lib/rbac';
import { canReadMinutes, isPrincipal, validateMinutesContent, type MinutesRow } from '@/lib/minutes';
import { isUuid } from '@/lib/event-workspace';

async function loadMinutes(societyId: string, minutesId: string): Promise<MinutesRow | null> {
  if (!isUuid(minutesId)) return null;
  const r = await query(
    `SELECT m.*, e.title AS event_title, p.name AS team_name, u.full_name AS author_name
     FROM minutes_sheets m
     JOIN users u ON u.id = m.created_by
     LEFT JOIN events e ON e.id = m.event_id
     LEFT JOIN event_teams et ON et.id = m.team_id
     LEFT JOIN portfolios p ON p.id = et.portfolio_id
     WHERE m.id = $1 AND m.society_id = $2 AND m.deleted_at IS NULL`,
    [minutesId, societyId],
  );
  return r.rows[0] ?? null;
}

// GET /api/societies/[id]/minutes/[minutesId] — full sheet, approval history, and allowed actions
export async function GET(req: NextRequest, { params }: { params: { id: string; minutesId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getSocietyAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    const minutes = await loadMinutes(params.id, params.minutesId);
    if (!minutes || !(await canReadMinutes(user, access, minutes))) return ApiErrors.notFound('Minutes');

    const steps = await query(
      `SELECT s.id, s.stage, s.action, s.comment, s.created_at, u.full_name AS actor_name
       FROM minutes_approval_steps s JOIN users u ON u.id = s.actor_id
       WHERE s.minutes_id = $1 ORDER BY s.created_at`,
      [minutes.id],
    );
    const isAuthor = minutes.created_by === user.userId;
    const principal = await isPrincipal(user.userId);
    return NextResponse.json({
      minutes,
      steps: steps.rows,
      actions: {
        edit: isAuthor && ['DRAFT', 'CHANGES_REQUESTED'].includes(minutes.status),
        submit: isAuthor && ['DRAFT', 'CHANGES_REQUESTED'].includes(minutes.status),
        delete: isAuthor && minutes.status === 'DRAFT',
        sponsor_decide: !isAuthor && minutes.status === 'SUBMITTED' && can(access, 'APPROVE_MINUTES'),
        forward: minutes.status === 'APPROVED' && can(access, 'REVIEW_MINUTES'),
        principal_decide: minutes.status === 'FORWARDED' && principal,
      },
    });
  } catch (error) {
    return ApiErrors.serverError('Minutes detail error:', error);
  }
}

// PATCH /api/societies/[id]/minutes/[minutesId] — author edits a draft or a sheet returned for changes
export async function PATCH(req: NextRequest, { params }: { params: { id: string; minutesId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const minutes = await loadMinutes(params.id, params.minutesId);
    if (!minutes || minutes.created_by !== user.userId) return ApiErrors.notFound('Minutes');
    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(minutes.status)) {
      return ApiErrors.conflict('Only drafts or sheets returned for changes can be edited.');
    }
    const input = validateMinutesContent(await req.json().catch(() => ({})));
    if ('error' in input) return input.error;

    await query(
      `UPDATE minutes_sheets SET title = $2, meeting_date = $3, venue = $4, attendees = $5::jsonb, agenda = $6,
              decisions = $7, action_items = $8::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [minutes.id, input.title, input.meeting_date, input.venue, JSON.stringify(input.attendees), input.agenda,
        input.decisions, JSON.stringify(input.action_items)],
    );
    await writeAuditLog({
      action: 'MINUTES_EDITED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'minutes_sheet',
      targetId: minutes.id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Edit minutes error:', error);
  }
}

// DELETE /api/societies/[id]/minutes/[minutesId] — author discards a draft
export async function DELETE(req: NextRequest, { params }: { params: { id: string; minutesId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const minutes = await loadMinutes(params.id, params.minutesId);
    if (!minutes || minutes.created_by !== user.userId) return ApiErrors.notFound('Minutes');
    if (minutes.status !== 'DRAFT') return forbidden('Only drafts can be deleted; submitted minutes are kept for the record.');
    await query('UPDATE minutes_sheets SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [minutes.id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Delete minutes error:', error);
  }
}
