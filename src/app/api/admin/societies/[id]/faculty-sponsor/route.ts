export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { setChangeContext } from '@/lib/rbac';
import { normalizeEmail, isAllowedNustEmail, NUST_ONLY_ERROR_MESSAGE } from '@/lib/email-policy';
import { notifyUser } from '@/lib/notify';

/**
 * PUT /api/admin/societies/[id]/faculty-sponsor  { email, reason }
 * Super admin assigns (or replaces) a society's Faculty Sponsor. If the person
 * has no account yet, the role is assigned automatically once they sign up and
 * verify their email.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') return ApiErrors.forbidden();

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const reason = String(body.reason || '').trim() || 'Faculty Sponsor assigned by platform administrator';
    if (!isAllowedNustEmail(email)) return ApiErrors.validation(NUST_ONLY_ERROR_MESSAGE);

    await client.query('BEGIN');
    const society = await client.query(
      `SELECT id, name, status FROM societies WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [params.id],
    );
    if (society.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Society');
    }

    await client.query('SELECT fn_seed_society_roles($1)', [params.id]);
    await client.query('UPDATE societies SET faculty_sponsor_email = $2, updated_at = NOW() WHERE id = $1', [params.id, email]);
    await setChangeContext(client, { actorId: user.userId, reason, source: 'DIRECT' });

    const sponsor = await client.query(`SELECT id FROM users WHERE email = $1 AND status = 'ACTIVE'`, [email]);
    const sponsorId: string | null = sponsor.rows[0]?.id ?? null;

    // Retire the current Faculty Sponsor (if it is someone else).
    await client.query(
      `UPDATE society_memberships sm SET is_active = FALSE, updated_at = NOW()
       FROM roles r
       WHERE sm.role_id = r.id AND r.tier = 'FACULTY_SPONSOR' AND sm.society_id = $1 AND sm.is_active
         AND sm.user_id IS DISTINCT FROM $2`,
      [params.id, sponsorId],
    );

    let assigned = false;
    if (sponsorId) {
      const already = await client.query(
        `SELECT 1 FROM society_memberships sm JOIN roles r ON r.id = sm.role_id
         WHERE sm.society_id = $1 AND sm.user_id = $2 AND sm.is_active AND r.tier = 'FACULTY_SPONSOR'`,
        [params.id, sponsorId],
      );
      if (already.rows.length === 0) {
        // Their society-wide membership (if any) becomes the Faculty Sponsor role.
        const updated = await client.query(
          `UPDATE society_memberships
           SET role_id = (SELECT id FROM roles WHERE society_id = $1 AND tier = 'FACULTY_SPONSOR' LIMIT 1),
               wing_id = NULL, portfolio_id = NULL, assigned_by = $3, updated_at = NOW()
           WHERE society_id = $1 AND user_id = $2 AND is_active AND wing_id IS NULL AND portfolio_id IS NULL
           RETURNING id`,
          [params.id, sponsorId, user.userId],
        );
        if (updated.rows.length === 0) {
          await client.query(
            `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
             SELECT $2, $1, r.id, TRUE, $3 FROM roles r WHERE r.society_id = $1 AND r.tier = 'FACULTY_SPONSOR'`,
            [params.id, sponsorId, user.userId],
          );
        }
      }
      await client.query(`UPDATE users SET designation = 'FACULTY' WHERE id = $1 AND designation = 'STUDENT'`, [sponsorId]);
      assigned = true;
    }

    await writeAuditLog(
      {
        action: 'FACULTY_SPONSOR_ASSIGNED',
        performedBy: user.userId,
        societyId: params.id,
        targetType: 'society',
        targetId: params.id,
        newValue: { email, assigned },
        metadata: { reason },
      },
      client,
    );
    await client.query('COMMIT');

    if (sponsorId) {
      await notifyUser(sponsorId, {
        title: 'You are a Faculty Sponsor',
        body: `You are now the Faculty Sponsor of ${society.rows[0].name}.`,
        link: `/society/${params.id}/dashboard`,
        email: true,
      });
    }
    return NextResponse.json({
      success: true,
      assigned,
      message: assigned
        ? 'Faculty Sponsor assigned.'
        : 'Saved. The role will be assigned when this person signs up and verifies their email.',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Assign faculty sponsor error:', error);
  } finally {
    client.release();
  }
}
