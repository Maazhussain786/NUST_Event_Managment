export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden, eventIsEditable } from '@/lib/rbac';
import { formWithAccess, validateQuestions, isFormAcceptingApplications } from '@/lib/recruitment';
import { cleanText, parseTimestamp } from '@/lib/event-workspace';

/**
 * GET /api/recruitment/forms/[formId]
 * Managers/viewers get the full form. Anyone signed in can read an OPEN form to apply,
 * along with their own application (if any).
 */
export async function GET(req: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const fa = await formWithAccess(user, params.formId);
    if (fa instanceof NextResponse) return fa;
    const { form, canManage, canView } = fa;

    if (!canView && form.status !== 'OPEN') return ApiErrors.notFound('Recruitment form');

    const mine = await query(
      `SELECT id, status, answers, preferred_team_id, submitted_at, updated_at
       FROM recruitment_applications WHERE form_id = $1 AND applicant_id = $2`,
      [form.id, user.userId],
    );
    const teams = form.target_role === 'TEAM_LEAD' && !form.team_id
      ? await query(
          `SELECT et.id, p.name FROM event_teams et JOIN portfolios p ON p.id = et.portfolio_id
           WHERE et.event_id = $1 AND et.is_active ORDER BY p.sort_order, p.name`,
          [form.event_id],
        )
      : { rows: [] };
    const society = await query('SELECT name FROM societies WHERE id = $1', [form.society_id]);

    return NextResponse.json({
      form: {
        id: form.id,
        society_id: form.society_id,
        society_name: society.rows[0]?.name ?? null,
        event_id: form.event_id,
        event_title: form.event_title,
        team_id: form.team_id,
        team_name: form.team_name,
        target_role: form.target_role,
        title: form.title,
        description: form.description,
        questions: form.questions,
        status: form.status,
        closes_at: form.closes_at,
        accepting: isFormAcceptingApplications(form),
      },
      selectable_teams: teams.rows,
      my_application: mine.rows[0] ?? null,
      can_manage: canManage,
      can_view_applications: canView,
    });
  } catch (error) {
    return ApiErrors.serverError('Recruitment form error:', error);
  }
}

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['CLOSED'],
  CLOSED: ['OPEN'],
  FINALIZED: [],
};

/**
 * PATCH /api/recruitment/forms/[formId] { title?, description?, questions?, closes_at?, status? }
 * Questions can only change before anyone has applied. Status: DRAFT -> OPEN <-> CLOSED.
 * FINALIZED is reached through /finalize.
 */
export async function PATCH(req: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const fa = await formWithAccess(user, params.formId);
    if (fa instanceof NextResponse) return fa;
    const { form, access, canManage } = fa;
    if (!canManage) return forbidden('You cannot edit this recruitment form.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');
    if (form.status === 'FINALIZED') return ApiErrors.conflict('This recruitment is finalized.');

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = cleanText(body.title, 300);
      if (!title) return ApiErrors.validation('Title is required');
      updates.title = title;
    }
    if (body.description !== undefined) updates.description = cleanText(body.description, 4000);
    if (body.closes_at !== undefined) {
      const closes = body.closes_at ? parseTimestamp(body.closes_at) : null;
      if (body.closes_at && !closes) return ApiErrors.validation('Invalid closing date');
      updates.closes_at = closes;
    }
    if (body.questions !== undefined) {
      const applied = await query(`SELECT 1 FROM recruitment_applications WHERE form_id = $1 LIMIT 1`, [form.id]);
      if (applied.rows.length > 0) return ApiErrors.conflict('Questions cannot change after people have applied.');
      const questions = validateQuestions(body.questions);
      if (typeof questions === 'string') return ApiErrors.validation(questions);
      updates.questions = JSON.stringify(questions);
    }
    if (body.status !== undefined && body.status !== form.status) {
      const next = String(body.status).toUpperCase();
      if (!TRANSITIONS[form.status]?.includes(next)) {
        return ApiErrors.validation(`Cannot change status from ${form.status} to ${next}`);
      }
      const questions = (updates.questions ? JSON.parse(String(updates.questions)) : form.questions) as unknown[];
      if (next === 'OPEN' && questions.length === 0) return ApiErrors.validation('Add at least one question before opening the form');
      updates.status = next;
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) return ApiErrors.validation('Nothing to update');
    const set = keys.map((k, i) => `${k} = $${i + 2}${k === 'questions' ? '::jsonb' : ''}`).join(', ');
    await query(`UPDATE recruitment_forms SET ${set}, updated_at = NOW() WHERE id = $1`, [form.id, ...keys.map((k) => updates[k])]);

    await writeAuditLog({
      action: 'RECRUITMENT_FORM_UPDATED',
      performedBy: user.userId,
      societyId: form.society_id,
      targetType: 'recruitment_form',
      targetId: form.id,
      newValue: { ...updates, questions: updates.questions ? 'changed' : undefined },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Update recruitment form error:', error);
  }
}
