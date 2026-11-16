export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden, eventIsEditable, ensureSocietyMember, setChangeContext, RbacError, TEAM_ROLE_LABELS } from '@/lib/rbac';
import { formWithAccess } from '@/lib/recruitment';
import { notifyUser } from '@/lib/notify';

/**
 * POST /api/recruitment/forms/[formId]/finalize  (FR-REC-05)
 * Places every SELECTED applicant on their team (Executive or Team Lead, source
 * RECRUITMENT), adds them to the society if needed, rejects everyone still
 * pending, notifies all applicants, and locks the form.
 */
export async function POST(req: NextRequest, { params }: { params: { formId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const fa = await formWithAccess(user, params.formId);
    if (fa instanceof NextResponse) return fa;
    const { form, access, canManage } = fa;
    if (!canManage) return forbidden('You cannot finalize this recruitment.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');
    if (form.status === 'FINALIZED') return ApiErrors.conflict('This recruitment is already finalized.');

    await client.query('BEGIN');
    const lock = await client.query('SELECT status FROM recruitment_forms WHERE id = $1 FOR UPDATE', [form.id]);
    if (lock.rows[0]?.status === 'FINALIZED') {
      await client.query('ROLLBACK');
      return ApiErrors.conflict('This recruitment is already finalized.');
    }

    const apps = await client.query(
      `SELECT a.id, a.applicant_id, a.status, COALESCE(a.placed_team_id, a.preferred_team_id) AS team_id, u.full_name
       FROM recruitment_applications a JOIN users u ON u.id = a.applicant_id
       WHERE a.form_id = $1 AND a.status NOT IN ('WITHDRAWN', 'REJECTED')`,
      [form.id],
    );
    const selected = apps.rows.filter((a) => a.status === 'SELECTED');
    if (selected.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.validation('Select at least one candidate before finalizing.');
    }

    await setChangeContext(client, { actorId: user.userId, reason: `Selected through recruitment: ${form.title}`, source: 'RECRUITMENT' });
    const teamRole = form.target_role;
    const placed: Array<{ userId: string; teamId: string }> = [];
    for (const a of selected) {
      const teamId = form.team_id ?? a.team_id;
      const team = await client.query('SELECT id FROM event_teams WHERE id = $1 AND event_id = $2 AND is_active', [teamId, form.event_id]);
      if (team.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiErrors.validation(`${a.full_name} has no active team to be placed in.`);
      }
      await ensureSocietyMember(client, form.society_id, a.applicant_id, user.userId);
      await client.query(
        `INSERT INTO event_team_members (team_id, event_id, society_id, user_id, team_role, source, assigned_by)
         VALUES ($1, $2, $3, $4, $5, 'RECRUITMENT', $6)
         ON CONFLICT (team_id, user_id) WHERE removed_at IS NULL
         DO UPDATE SET team_role = EXCLUDED.team_role`,
        [teamId, form.event_id, form.society_id, a.applicant_id, teamRole, user.userId],
      );
      await client.query('UPDATE recruitment_applications SET placed_team_id = $2, updated_at = NOW() WHERE id = $1', [a.id, teamId]);
      placed.push({ userId: a.applicant_id, teamId });
    }

    const rejected = await client.query(
      `UPDATE recruitment_applications
       SET status = 'REJECTED', decided_by = $2, decided_at = NOW(), updated_at = NOW()
       WHERE form_id = $1 AND status IN ('SUBMITTED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED')
       RETURNING applicant_id`,
      [form.id, user.userId],
    );
    await client.query(
      `UPDATE recruitment_forms SET status = 'FINALIZED', finalized_by = $2, finalized_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [form.id, user.userId],
    );
    await writeAuditLog(
      {
        action: 'RECRUITMENT_FINALIZED',
        performedBy: user.userId,
        societyId: form.society_id,
        targetType: 'recruitment_form',
        targetId: form.id,
        newValue: { selected: placed.length, rejected: rejected.rowCount },
      },
      client,
    );
    await client.query('COMMIT');

    const link = `/society/${form.society_id}/events/${form.event_id}/workspace`;
    for (const p of placed) {
      await notifyUser(p.userId, {
        title: `Welcome to the team: ${form.team_name ?? form.title}`,
        body: `You were selected as ${TEAM_ROLE_LABELS[teamRole]} for "${form.event_title}".`,
        link,
        email: true,
      });
    }
    for (const r of rejected.rows) {
      await notifyUser(r.applicant_id, {
        title: `Application update: ${form.title}`,
        body: 'Thank you for applying. You were not selected this time.',
        link: `/recruitment/${form.id}`,
        email: true,
      });
    }
    return NextResponse.json({ success: true, placed: placed.length, rejected: rejected.rowCount });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof RbacError) return ApiErrors.conflict(error.message);
    return ApiErrors.serverError('Finalize recruitment error:', error);
  } finally {
    client.release();
  }
}
