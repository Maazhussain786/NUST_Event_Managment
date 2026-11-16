export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden, eventIsEditable } from '@/lib/rbac';
import { formWithAccess } from '@/lib/recruitment';
import { isUuid, cleanText, parseTimestamp } from '@/lib/event-workspace';
import { notifyUser } from '@/lib/notify';

/**
 * POST /api/recruitment/applications/[appId]/interviews  (FR-REC-04)
 * { scheduled_at, mode: IN_PERSON | ONLINE, location?, meeting_link?, interviewer_id? }
 */
export async function POST(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    if (!isUuid(params.appId)) return ApiErrors.notFound('Application');
    const appResult = await query(
      'SELECT id, form_id, applicant_id, status FROM recruitment_applications WHERE id = $1',
      [params.appId],
    );
    const app = appResult.rows[0];
    if (!app) return ApiErrors.notFound('Application');

    const fa = await formWithAccess(user, app.form_id);
    if (fa instanceof NextResponse) return fa;
    if (!fa.canManage) return forbidden('You cannot schedule interviews for this form.');
    if (!eventIsEditable(fa.access)) return ApiErrors.conflict('This event is archived.');
    if (!['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED'].includes(app.status)) {
      return ApiErrors.conflict('Shortlist the candidate before scheduling an interview.');
    }

    const body = await req.json().catch(() => ({}));
    const scheduledAt = parseTimestamp(body.scheduled_at);
    if (!scheduledAt) return ApiErrors.validation('Choose a date and time');
    const mode = String(body.mode || 'IN_PERSON').toUpperCase();
    if (mode !== 'IN_PERSON' && mode !== 'ONLINE') return ApiErrors.validation('Invalid interview mode');
    const meetingLink = cleanText(body.meeting_link, 500);
    if (meetingLink && !/^https?:\/\//i.test(meetingLink)) return ApiErrors.validation('Meeting link must start with http(s)://');
    const interviewer = isUuid(body.interviewer_id) ? body.interviewer_id : user.userId;

    const inserted = await query(
      `INSERT INTO recruitment_interviews (application_id, scheduled_at, mode, location, meeting_link, interviewer_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [app.id, scheduledAt, mode, cleanText(body.location, 300), meetingLink, interviewer, user.userId],
    );
    await query(
      `UPDATE recruitment_applications SET status = 'INTERVIEW_SCHEDULED', updated_at = NOW()
       WHERE id = $1 AND status = 'SHORTLISTED'`,
      [app.id],
    );
    await writeAuditLog({
      action: 'RECRUITMENT_INTERVIEW_SCHEDULED',
      performedBy: user.userId,
      societyId: fa.form.society_id,
      targetType: 'recruitment_interview',
      targetId: inserted.rows[0].id,
      newValue: { scheduledAt, mode },
    });

    const when = new Date(scheduledAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });
    const where = mode === 'ONLINE' ? (meetingLink ? `online: ${meetingLink}` : 'online') : (cleanText(body.location, 300) ?? 'location to be shared');
    await notifyUser(app.applicant_id, {
      title: `Interview scheduled: ${fa.form.title}`,
      body: `Your interview is on ${when} (${where}).`,
      link: `/recruitment/${fa.form.id}`,
      email: true,
    });
    return NextResponse.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Schedule interview error:', error);
  }
}
