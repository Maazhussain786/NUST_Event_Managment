export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, checkApiRateLimit } from '@/lib/api-utils';
import { forbidden } from '@/lib/rbac';
import { formWithAccess, validateAnswers, isFormAcceptingApplications } from '@/lib/recruitment';
import { isUuid } from '@/lib/event-workspace';
import { notifyUsers, teamMemberIds } from '@/lib/notify';

// GET /api/recruitment/forms/[formId]/applications — applications with interviews (reviewers)
export async function GET(req: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const fa = await formWithAccess(user, params.formId);
    if (fa instanceof NextResponse) return fa;
    if (!fa.canView) return forbidden('You cannot view these applications.');

    const [apps, interviews] = await Promise.all([
      query(
        `SELECT a.id, a.status, a.answers, a.reviewer_notes, a.preferred_team_id, pp.name AS preferred_team_name,
                a.placed_team_id, a.submitted_at, a.updated_at, a.decided_at,
                u.id AS applicant_id, u.full_name, u.email, u.cms_id
         FROM recruitment_applications a
         JOIN users u ON u.id = a.applicant_id
         LEFT JOIN event_teams pt ON pt.id = a.preferred_team_id
         LEFT JOIN portfolios pp ON pp.id = pt.portfolio_id
         WHERE a.form_id = $1
         ORDER BY CASE a.status WHEN 'SELECTED' THEN 0 WHEN 'INTERVIEWED' THEN 1 WHEN 'INTERVIEW_SCHEDULED' THEN 2
                                 WHEN 'SHORTLISTED' THEN 3 WHEN 'SUBMITTED' THEN 4 ELSE 5 END,
                  a.submitted_at`,
        [fa.form.id],
      ),
      query(
        `SELECT i.id, i.application_id, i.scheduled_at, i.mode, i.location, i.meeting_link, i.status,
                i.score, i.notes, iu.full_name AS interviewer_name
         FROM recruitment_interviews i
         JOIN recruitment_applications a ON a.id = i.application_id
         LEFT JOIN users iu ON iu.id = i.interviewer_id
         WHERE a.form_id = $1
         ORDER BY i.scheduled_at`,
        [fa.form.id],
      ),
    ]);

    const byApp = new Map<string, unknown[]>();
    for (const i of interviews.rows) {
      byApp.set(i.application_id, [...(byApp.get(i.application_id) ?? []), i]);
    }
    return NextResponse.json({
      form: { id: fa.form.id, title: fa.form.title, status: fa.form.status, questions: fa.form.questions, target_role: fa.form.target_role },
      can_manage: fa.canManage,
      applications: apps.rows.map((a) => ({ ...a, interviews: byApp.get(a.id) ?? [] })),
    });
  } catch (error) {
    return ApiErrors.serverError('List applications error:', error);
  }
}

// POST /api/recruitment/forms/[formId]/applications { answers, preferred_team_id? } — apply (FR-REC-02)
export async function POST(req: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const limited = checkApiRateLimit(user.userId, 'recruitment-apply', 10);
    if (limited) return limited;

    const fa = await formWithAccess(user, params.formId);
    if (fa instanceof NextResponse) return fa;
    const { form } = fa;
    if (!isFormAcceptingApplications(form)) return ApiErrors.conflict('This form is not accepting applications.');

    const suspended = await query(
      `SELECT 1 FROM society_memberships WHERE society_id = $1 AND user_id = $2 AND suspended_at IS NOT NULL AND NOT is_active`,
      [form.society_id, user.userId],
    );
    if (suspended.rows.length > 0) return forbidden('You are suspended from this society.');

    if (form.team_id) {
      const already = await query(
        `SELECT 1 FROM event_team_members WHERE team_id = $1 AND user_id = $2 AND removed_at IS NULL`,
        [form.team_id, user.userId],
      );
      if (already.rows.length > 0) return ApiErrors.conflict('You are already on this team.');
    }

    const body = await req.json().catch(() => ({}));
    const answers = validateAnswers(form.questions, body.answers);
    if (typeof answers === 'string') return ApiErrors.validation(answers);

    let preferredTeam: string | null = null;
    if (form.target_role === 'TEAM_LEAD' && !form.team_id) {
      if (!isUuid(body.preferred_team_id)) return ApiErrors.validation('Choose the portfolio you want to lead');
      const team = await query('SELECT 1 FROM event_teams WHERE id = $1 AND event_id = $2 AND is_active', [body.preferred_team_id, form.event_id]);
      if (team.rows.length === 0) return ApiErrors.validation('That portfolio is not active for this event');
      preferredTeam = body.preferred_team_id;
    }

    const inserted = await query(
      `INSERT INTO recruitment_applications (form_id, society_id, event_id, applicant_id, preferred_team_id, answers)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (form_id, applicant_id) DO UPDATE
         SET answers = EXCLUDED.answers, preferred_team_id = EXCLUDED.preferred_team_id,
             status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
         WHERE recruitment_applications.status = 'WITHDRAWN'
       RETURNING id, status`,
      [form.id, form.society_id, form.event_id, user.userId, preferredTeam, JSON.stringify(answers)],
    );
    if (inserted.rows.length === 0) return ApiErrors.conflict('You have already applied to this form.');

    const reviewers = form.team_id ? await teamMemberIds(form.team_id, true) : [form.created_by];
    await notifyUsers(reviewers, {
      title: `New application: ${form.title}`,
      body: `${user.fullName} applied.`,
      link: `/society/${form.society_id}/events/${form.event_id}/workspace?tab=recruitment&form=${form.id}`,
      push: false,
    });
    return NextResponse.json({ success: true, application: inserted.rows[0] }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Apply error:', error);
  }
}
