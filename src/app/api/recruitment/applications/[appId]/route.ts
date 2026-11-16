export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden, eventIsEditable } from '@/lib/rbac';
import { formWithAccess } from '@/lib/recruitment';
import { isUuid, cleanText } from '@/lib/event-workspace';
import { notifyUser } from '@/lib/notify';

async function loadApplication(appId: string) {
  if (!isUuid(appId)) return null;
  const r = await query(
    `SELECT a.id, a.form_id, a.applicant_id, a.status, a.preferred_team_id, a.placed_team_id
     FROM recruitment_applications a WHERE a.id = $1`,
    [appId],
  );
  return r.rows[0] ?? null;
}

const ACTIONS: Record<string, { from: string[]; to: string }> = {
  SHORTLIST: { from: ['SUBMITTED'], to: 'SHORTLISTED' },
  SELECT: { from: ['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED'], to: 'SELECTED' },
  REJECT: { from: ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED', 'SELECTED'], to: 'REJECTED' },
  RECONSIDER: { from: ['REJECTED', 'SELECTED'], to: 'SHORTLISTED' },
};

/**
 * PATCH /api/recruitment/applications/[appId]
 * { action: SHORTLIST | SELECT | REJECT | RECONSIDER | NOTE, notes?, placed_team_id? }
 * Shortlisted and rejected candidates are notified (FR-REC-03).
 */
export async function PATCH(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const app = await loadApplication(params.appId);
    if (!app) return ApiErrors.notFound('Application');
    const fa = await formWithAccess(user, app.form_id);
    if (fa instanceof NextResponse) return fa;
    if (!fa.canManage) return forbidden('You cannot review this application.');
    if (!eventIsEditable(fa.access)) return ApiErrors.conflict('This event is archived.');
    if (fa.form.status === 'FINALIZED') return ApiErrors.conflict('This recruitment is finalized.');
    if (app.applicant_id === user.userId) return forbidden('You cannot review your own application.');

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase();
    const notes = body.notes !== undefined ? cleanText(body.notes, 4000) : undefined;

    if (action === 'NOTE') {
      await query('UPDATE recruitment_applications SET reviewer_notes = $2, updated_at = NOW() WHERE id = $1', [app.id, notes ?? null]);
      return NextResponse.json({ success: true, status: app.status });
    }

    const rule = ACTIONS[action];
    if (!rule) return ApiErrors.validation('Unknown action');
    if (!rule.from.includes(app.status)) return ApiErrors.conflict(`Cannot ${action.toLowerCase()} an application that is ${app.status.toLowerCase()}`);

    let placedTeam: string | null = app.placed_team_id;
    if (action === 'SELECT' && fa.form.target_role === 'TEAM_LEAD' && !fa.form.team_id) {
      const candidate = isUuid(body.placed_team_id) ? body.placed_team_id : app.preferred_team_id;
      const team = await query('SELECT 1 FROM event_teams WHERE id = $1 AND event_id = $2 AND is_active', [candidate, fa.form.event_id]);
      if (team.rows.length === 0) return ApiErrors.validation('Choose an active portfolio to place this Team Lead in');
      placedTeam = candidate;
    }

    await query(
      `UPDATE recruitment_applications
       SET status = $2, reviewer_notes = COALESCE($3, reviewer_notes), placed_team_id = $4,
           decided_by = CASE WHEN $2 IN ('SELECTED', 'REJECTED') THEN $5::uuid ELSE decided_by END,
           decided_at = CASE WHEN $2 IN ('SELECTED', 'REJECTED') THEN NOW() ELSE decided_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [app.id, rule.to, notes ?? null, placedTeam, user.userId],
    );
    await writeAuditLog({
      action: `RECRUITMENT_${action}`,
      performedBy: user.userId,
      societyId: fa.form.society_id,
      targetType: 'recruitment_application',
      targetId: app.id,
      oldValue: { status: app.status },
      newValue: { status: rule.to },
    });

    if (action === 'SHORTLIST' || action === 'REJECT') {
      await notifyUser(app.applicant_id, {
        title: action === 'SHORTLIST' ? `Shortlisted: ${fa.form.title}` : `Application update: ${fa.form.title}`,
        body: action === 'SHORTLIST'
          ? `You have been shortlisted for ${fa.form.team_name ?? 'a team'} (${fa.form.event_title}). Watch for an interview invitation.`
          : `Thank you for applying to ${fa.form.title}. You were not selected this time.`,
        link: `/recruitment/${fa.form.id}`,
        email: true,
      });
    }
    return NextResponse.json({ success: true, status: rule.to });
  } catch (error) {
    return ApiErrors.serverError('Review application error:', error);
  }
}

// DELETE /api/recruitment/applications/[appId] — applicant withdraws (before a decision)
export async function DELETE(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const app = await loadApplication(params.appId);
    if (!app || app.applicant_id !== user.userId) return ApiErrors.notFound('Application');
    const updated = await query(
      `UPDATE recruitment_applications SET status = 'WITHDRAWN', updated_at = NOW()
       WHERE id = $1 AND status IN ('SUBMITTED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED') RETURNING id`,
      [app.id],
    );
    if (updated.rows.length === 0) return ApiErrors.conflict('This application can no longer be withdrawn.');
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Withdraw application error:', error);
  }
}
