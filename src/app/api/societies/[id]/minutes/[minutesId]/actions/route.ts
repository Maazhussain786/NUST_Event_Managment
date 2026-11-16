export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { getSocietyAccess, can, forbidden } from '@/lib/rbac';
import { isPrincipal } from '@/lib/minutes';
import { cleanText, isUuid } from '@/lib/event-workspace';
import { notifyUser, notifyUsers, usersWithSocietyPrivilege } from '@/lib/notify';

type Stage = 'AUTHOR' | 'FACULTY_SPONSOR' | 'ADMIN' | 'PRINCIPAL';

/**
 * POST /api/societies/[id]/minutes/[minutesId]/actions { action, comment? }  (FR-MIN-02..05)
 *   SUBMIT                                 author:          DRAFT | CHANGES_REQUESTED -> SUBMITTED
 *   APPROVE | REJECT | REQUEST_CHANGES     Faculty Sponsor: SUBMITTED -> APPROVED (locked) | REJECTED | CHANGES_REQUESTED
 *   FORWARD                                Admin:           APPROVED -> FORWARDED (to the Principal)
 *   PRINCIPAL_APPROVE | PRINCIPAL_REJECT   Principal:       FORWARDED -> PRINCIPAL_APPROVED | PRINCIPAL_REJECTED
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; minutesId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    if (!isUuid(params.minutesId)) return ApiErrors.notFound('Minutes');
    const access = await getSocietyAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase();
    const comment = cleanText(body.comment, 4000);

    await client.query('BEGIN');
    const result = await client.query(
      `SELECT m.id, m.title, m.status, m.created_by, m.society_id, s.name AS society_name
       FROM minutes_sheets m JOIN societies s ON s.id = m.society_id
       WHERE m.id = $1 AND m.society_id = $2 AND m.deleted_at IS NULL FOR UPDATE OF m`,
      [params.minutesId, params.id],
    );
    const m = result.rows[0];
    const fail = async (res: NextResponse) => {
      await client.query('ROLLBACK');
      return res;
    };
    if (!m) return fail(ApiErrors.notFound('Minutes'));
    const isAuthor = m.created_by === user.userId;

    let next: string;
    let stage: Stage;
    let stepAction: string;
    let lock = false;
    switch (action) {
      case 'SUBMIT':
        if (!isAuthor) return fail(forbidden('Only the author can submit these minutes.'));
        if (!['DRAFT', 'CHANGES_REQUESTED'].includes(m.status)) return fail(ApiErrors.conflict(`Minutes are ${m.status.toLowerCase()}`));
        next = 'SUBMITTED'; stage = 'AUTHOR'; stepAction = m.status === 'DRAFT' ? 'SUBMITTED' : 'RESUBMITTED';
        break;
      case 'APPROVE':
      case 'REJECT':
      case 'REQUEST_CHANGES':
        if (!can(access, 'APPROVE_MINUTES')) return fail(forbidden('Only the Faculty Sponsor can approve minutes.'));
        if (isAuthor) return fail(forbidden('You cannot approve minutes you wrote.'));
        if (m.status !== 'SUBMITTED') return fail(ApiErrors.conflict('Only submitted minutes can be reviewed.'));
        if (action !== 'APPROVE' && !comment) return fail(ApiErrors.validation('Add a comment explaining your decision'));
        next = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';
        stage = 'FACULTY_SPONSOR';
        stepAction = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_CHANGES: 'CHANGES_REQUESTED' }[action];
        lock = action === 'APPROVE';
        break;
      case 'FORWARD':
        if (!can(access, 'REVIEW_MINUTES')) return fail(forbidden('Only Admins can forward minutes to the Principal.'));
        if (m.status !== 'APPROVED') return fail(ApiErrors.conflict('Only approved minutes can be forwarded.'));
        next = 'FORWARDED'; stage = 'ADMIN'; stepAction = 'FORWARDED';
        break;
      case 'PRINCIPAL_APPROVE':
      case 'PRINCIPAL_REJECT':
        if (!(await isPrincipal(user.userId))) return fail(forbidden('Only the Principal can make this decision.'));
        if (m.status !== 'FORWARDED') return fail(ApiErrors.conflict('These minutes have not been forwarded to you.'));
        if (action === 'PRINCIPAL_REJECT' && !comment) return fail(ApiErrors.validation('Add a comment explaining your decision'));
        next = action === 'PRINCIPAL_APPROVE' ? 'PRINCIPAL_APPROVED' : 'PRINCIPAL_REJECTED';
        stage = 'PRINCIPAL'; stepAction = action === 'PRINCIPAL_APPROVE' ? 'APPROVED' : 'REJECTED';
        break;
      default:
        return fail(ApiErrors.validation('Unknown action'));
    }

    await client.query(
      `UPDATE minutes_sheets
       SET status = $2, updated_at = NOW(),
           submitted_at = CASE WHEN $2 = 'SUBMITTED' THEN NOW() ELSE submitted_at END,
           locked_at = CASE WHEN $3 THEN NOW() ELSE locked_at END
       WHERE id = $1`,
      [m.id, next, lock],
    );
    await client.query(
      `INSERT INTO minutes_approval_steps (minutes_id, stage, action, actor_id, comment) VALUES ($1, $2, $3, $4, $5)`,
      [m.id, stage, stepAction, user.userId, comment],
    );
    await writeAuditLog(
      {
        action: `MINUTES_${action}`,
        performedBy: user.userId,
        societyId: params.id,
        targetType: 'minutes_sheet',
        targetId: m.id,
        oldValue: { status: m.status },
        newValue: { status: next, comment },
      },
      client,
    );
    await client.query('COMMIT');

    // Notifications
    const link = `/society/${params.id}/minutes/${m.id}`;
    const note = comment ? ` Comment: ${comment}` : '';
    if (next === 'SUBMITTED') {
      await notifyUsers((await usersWithSocietyPrivilege(params.id, 'APPROVE_MINUTES')).filter((id) => id !== user.userId), {
        title: `Minutes awaiting approval: ${m.title}`, body: `${user.fullName} submitted minutes for your approval.`, link, email: true,
      });
    } else if (stage === 'FACULTY_SPONSOR') {
      await notifyUser(m.created_by, {
        title: `Minutes ${next.replace('_', ' ').toLowerCase()}: ${m.title}`,
        body: `The Faculty Sponsor ${next === 'APPROVED' ? 'approved' : next === 'REJECTED' ? 'rejected' : 'requested changes to'} your minutes.${note}`,
        link, email: true,
      });
      if (next === 'APPROVED') {
        await notifyUsers((await usersWithSocietyPrivilege(params.id, 'REVIEW_MINUTES')).filter((id) => id !== user.userId), {
          title: `Approved minutes: ${m.title}`, body: 'The Faculty Sponsor approved these minutes. Review them and forward to the Principal if needed.', link,
        });
      }
    } else if (next === 'FORWARDED') {
      const principals = await query(`SELECT id FROM users WHERE designation = 'PRINCIPAL' AND status = 'ACTIVE'`);
      await notifyUsers(principals.rows.map((r: { id: string }) => r.id), {
        title: `Minutes for your approval: ${m.title}`, body: `${m.society_name} forwarded approved minutes for your final approval.${note}`,
        link: `/principal`, email: true,
      });
      await notifyUser(m.created_by, { title: `Minutes forwarded: ${m.title}`, body: 'Your approved minutes were forwarded to the Principal.', link });
    } else if (stage === 'PRINCIPAL') {
      const recipients = [m.created_by, ...(await usersWithSocietyPrivilege(params.id, 'REVIEW_MINUTES'))];
      await notifyUsers(recipients, {
        title: `Principal ${next === 'PRINCIPAL_APPROVED' ? 'approved' : 'rejected'}: ${m.title}`,
        body: `The Principal ${next === 'PRINCIPAL_APPROVED' ? 'approved' : 'rejected'} these minutes.${note}`, link, email: true,
      });
    }
    return NextResponse.json({ success: true, status: next });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Minutes action error:', error);
  } finally {
    client.release();
  }
}
