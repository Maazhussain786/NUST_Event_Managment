export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/societies/[id]/members/reactivate
 *
 * Reactivate a suspended member.
 * Auth: Requester must outrank target (same rules as suspend).
 *       - Cannot reactivate self
 *       - Cannot reactivate equal or higher rank
 * Body: { targetUserId: string, reason?: string }
 *
 * Clears: suspended_at, suspended_by, suspension_reason; sets is_active = TRUE
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;
    const body = await req.json();
    const { targetUserId, reason } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }

    if (targetUserId === user.userId) {
      return NextResponse.json({ error: 'Cannot reactivate yourself' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. Verify society exists
    const society = await client.query(
      `SELECT id, name, status FROM societies WHERE id = $1`,
      [societyId]
    );
    if (society.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }

    // 2. Get requester's hierarchy level
    const myMembership = await client.query(
      `SELECT r.hierarchy_level, r.name as role_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
         AND sm.suspended_at IS NULL
       ORDER BY r.hierarchy_level DESC LIMIT 1`,
      [user.userId, societyId]
    );
    const myLevel = user.userType === 'SUPER_ADMIN' ? 999 : (myMembership.rows[0]?.hierarchy_level ?? 0);

    if (myLevel === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'You are not an active member of this society' }, { status: 403 });
    }

    // 3. Get target's suspended membership
    const targetMembership = await client.query(
      `SELECT sm.id, sm.is_active, sm.suspended_at, sm.suspension_reason,
              r.hierarchy_level, r.name as role_name, u.full_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       JOIN users u ON sm.user_id = u.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.suspended_at IS NOT NULL
       ORDER BY sm.suspended_at DESC LIMIT 1`,
      [targetUserId, societyId]
    );
    if (targetMembership.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'No suspended membership found for this user' }, { status: 404 });
    }

    const target = targetMembership.rows[0];

    // Cannot reactivate equal or higher rank
    if (target.hierarchy_level >= myLevel) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cannot reactivate a member of equal or higher rank' }, { status: 403 });
    }

    // 4. Reactivate — clear suspension fields, set is_active = TRUE
    await client.query(
      `UPDATE society_memberships
       SET is_active = TRUE,
           suspended_at = NULL,
           suspended_by = NULL,
           suspension_reason = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [target.id]
    );

    // 5. Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('MEMBER_REACTIVATED', $1, $2, 'society_membership', $3, $4, $5, $6)`,
      [
        user.userId,
        societyId,
        target.id,
        JSON.stringify({ is_active: false, suspended_at: target.suspended_at, suspension_reason: target.suspension_reason }),
        JSON.stringify({ is_active: true, suspended_at: null }),
        JSON.stringify({
          targetUserId,
          targetName: target.full_name,
          targetRole: target.role_name,
          reactivatedBy: user.fullName,
          reason: reason || 'No reason provided',
        }),
      ]
    );

    // 6. Notify reactivated member
    await client.query(
      `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
      [
        targetUserId,
        'Membership Reactivated ✅',
        `Your membership in ${society.rows[0].name} has been reactivated.`,
        `/society/${societyId}/dashboard`,
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `${target.full_name} has been reactivated in ${society.rows[0].name}`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Member reactivate error:', error);
    return NextResponse.json({ error: 'Failed to reactivate member' }, { status: 500 });
  } finally {
    client.release();
  }
}
