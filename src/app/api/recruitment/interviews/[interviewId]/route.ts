export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden, eventIsEditable } from '@/lib/rbac';
import { formWithAccess } from '@/lib/recruitment';
import { isUuid, cleanText } from '@/lib/event-workspace';

/**
 * PATCH /api/recruitment/interviews/[interviewId]  (FR-REC-04: record scores and notes)
 * { status?: COMPLETED | NO_SHOW | CANCELLED, score?: 0-10, notes? }
 */
export async function PATCH(req: NextRequest, { params }: { params: { interviewId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    if (!isUuid(params.interviewId)) return ApiErrors.notFound('Interview');
    const result = await query(
      `SELECT i.id, i.status, i.application_id, a.form_id
       FROM recruitment_interviews i JOIN recruitment_applications a ON a.id = i.application_id
       WHERE i.id = $1`,
      [params.interviewId],
    );
    const interview = result.rows[0];
    if (!interview) return ApiErrors.notFound('Interview');

    const fa = await formWithAccess(user, interview.form_id);
    if (fa instanceof NextResponse) return fa;
    if (!fa.canManage) return forbidden('You cannot update this interview.');
    if (!eventIsEditable(fa.access)) return ApiErrors.conflict('This event is archived.');
    if (fa.form.status === 'FINALIZED') return ApiErrors.conflict('This recruitment is finalized.');

    const body = await req.json().catch(() => ({}));
    const status = body.status ? String(body.status).toUpperCase() : interview.status;
    if (!['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(status)) return ApiErrors.validation('Invalid status');
    let score: number | null | undefined;
    if (body.score !== undefined && body.score !== null && body.score !== '') {
      score = Number(body.score);
      if (!Number.isFinite(score) || score < 0 || score > 10) return ApiErrors.validation('Score must be between 0 and 10');
      score = Math.round(score * 10) / 10;
    }

    await query(
      `UPDATE recruitment_interviews
       SET status = $2, score = COALESCE($3, score), notes = COALESCE($4, notes), updated_at = NOW()
       WHERE id = $1`,
      [interview.id, status, score ?? null, body.notes !== undefined ? cleanText(body.notes, 4000) : null],
    );
    if (status === 'COMPLETED') {
      await query(
        `UPDATE recruitment_applications SET status = 'INTERVIEWED', updated_at = NOW()
         WHERE id = $1 AND status IN ('SHORTLISTED', 'INTERVIEW_SCHEDULED')`,
        [interview.application_id],
      );
    }
    await writeAuditLog({
      action: 'RECRUITMENT_INTERVIEW_UPDATED',
      performedBy: user.userId,
      societyId: fa.form.society_id,
      targetType: 'recruitment_interview',
      targetId: interview.id,
      newValue: { status, score: score ?? undefined },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Update interview error:', error);
  }
}
