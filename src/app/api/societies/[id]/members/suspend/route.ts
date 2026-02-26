export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/societies/[id]/members/suspend
 *
 * Suspend a member from a society.
 * Auth: Requester must outrank target (fn_can_manage logic).
 *       - Cannot suspend President (unless SA)
 *       - Cannot suspend self
 *       - Cannot suspend equal or higher rank
 * Body: { targetUserId: string, reason: string }
 *
 * Sets: suspended_at = NOW(), suspended_by = requester, is_active = FALSE
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
    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason is required for suspension' }, { status: 400 });
    }

    if (targetUserId === user.userId) {
      return NextResponse.json({ error: 'Cannot suspend yourself' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. Verify society exists and is active
    const society = await client.query(
      `SELECT id, name, status FROM societies WHERE id = $1`,
      [societyId]
    );
    if (society.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }
    if (society.rows[0].status !== 'APPROVED' && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society is not active' }, { status: 409 });
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

    // 3. Get target's membership
    const targetMembership = await client.query(
      `SELECT sm.id, sm.is_active, sm.suspended_at, r.hierarchy_level, r.name as role_name, u.full_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       JOIN users u ON sm.user_id = u.id
       WHERE sm.user_id = $1 AND sm.society_id = $2
         AND sm.is_active = TRUE
       ORDER BY r.hierarchy_level DESC LIMIT 1`,
      [targetUserId, societyId]
    );
    if (targetMembership.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Target is not an active member of this society' }, { status: 404 });
    }

    const target = targetMembership.rows[0];

    // Already suspended?
    if (target.suspended_at !== null) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Member is already suspended' }, { status: 409 });
    }

    // Cannot suspend President unless you are SA
    if (target.role_name === 'President' && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Only a SuperAdmin can suspend a President' }, { status: 403 });
    }

    // Cannot suspend equal or higher rank
    if (target.hierarchy_level >= myLevel) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cannot suspend a member of equal or higher rank' }, { status: 403 });
    }

    // 4. Suspend — set is_active=FALSE, suspended_at, suspended_by, suspension_reason
    await client.query(
      `UPDATE society_memberships
       SET is_active = FALSE,
           suspended_at = NOW(),
           suspended_by = $1,
           suspension_reason = $2,
           updated_at = NOW()
       WHERE user_id = $3 AND society_id = $4 AND is_active = TRUE`,
      [user.userId, reason.trim(), targetUserId, societyId]
    );

    // 5. Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('MEMBER_SUSPENDED', $1, $2, 'society_membership', $3, $4, $5, $6)`,
      [
        user.userId,
        societyId,
        target.id,
        JSON.stringify({ is_active: true, suspended_at: null }),
        JSON.stringify({ is_active: false, suspended_at: 'NOW()' }),
        JSON.stringify({
          targetUserId,
          targetName: target.full_name,
          targetRole: target.role_name,
          reason: reason.trim(),
          suspendedBy: user.fullName,
        }),
      ]
    );

    // 6. Notify suspended member
    await client.query(
      `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
      [
        targetUserId,
        'Membership Suspended',
        `Your membership in ${society.rows[0].name} has been suspended. Reason: ${reason.trim()}`,
        '/societies',
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `${target.full_name} has been suspended from ${society.rows[0].name}`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Member suspend error:', error);
    return NextResponse.json({ error: 'Failed to suspend member' }, { status: 500 });
  } finally {
    client.release();
  }
}
