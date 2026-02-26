export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/societies/[id]/transfer-presidency
 *
 * President-initiated presidency transfer.
 * Auth: Must be the active President of this society.
 * Body: { targetUserId: string }
 *
 * Flow (transaction):
 *   1. Validate requester is active President
 *   2. Validate target is active member (not suspended), has .edu.pk email
 *   3. Deactivate current President membership
 *   4. Get President role id
 *   5. Insert new President membership for target (trigger-safe because old one just deactivated)
 *   6. Create a new Member membership for the old President (demote)
 *   7. Audit log
 *   8. Notify both users
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
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }

    if (targetUserId === user.userId) {
      return NextResponse.json({ error: 'Cannot transfer presidency to yourself' }, { status: 400 });
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
    if (society.rows[0].status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society is not active' }, { status: 409 });
    }

    // 2. Verify requester is active President
    const myMembership = await client.query(
      `SELECT sm.id, r.name as role_name, r.hierarchy_level
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
         AND sm.suspended_at IS NULL
       ORDER BY r.hierarchy_level DESC LIMIT 1`,
      [user.userId, societyId]
    );
    if (myMembership.rows.length === 0 || myMembership.rows[0].role_name !== 'President') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Only the active President can transfer presidency' }, { status: 403 });
    }
    const oldPresidentMembershipId = myMembership.rows[0].id;

    // 3. Verify target user exists and has .edu.pk email
    const targetUser = await client.query(
      `SELECT id, email, full_name, status FROM users WHERE id = $1`,
      [targetUserId]
    );
    if (targetUser.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }
    if (targetUser.rows[0].status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Target user account is not active' }, { status: 409 });
    }
    if (!targetUser.rows[0].email.endsWith('.edu.pk')) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Target user must have a .edu.pk email' }, { status: 400 });
    }

    // 4. Verify target is an active, non-suspended member of the society
    const targetMembership = await client.query(
      `SELECT sm.id, r.name as role_name, r.id as role_id
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
         AND sm.suspended_at IS NULL`,
      [targetUserId, societyId]
    );
    if (targetMembership.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Target is not an active member of this society' }, { status: 409 });
    }

    // 5. Get role IDs
    const presidentRole = await client.query(
      `SELECT id FROM roles WHERE society_id = $1 AND name = 'President'`,
      [societyId]
    );
    const memberRole = await client.query(
      `SELECT id FROM roles WHERE society_id = $1 AND name = 'Member'`,
      [societyId]
    );
    if (presidentRole.rows.length === 0 || memberRole.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society roles not properly configured' }, { status: 500 });
    }
    const presidentRoleId = presidentRole.rows[0].id;
    const memberRoleId = memberRole.rows[0].id;

    // 6. Deactivate old President's membership
    await client.query(
      `UPDATE society_memberships SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [oldPresidentMembershipId]
    );

    // 7. Deactivate target's current membership (to avoid unique constraint conflicts)
    await client.query(
      `UPDATE society_memberships SET is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND society_id = $2 AND is_active = TRUE`,
      [targetUserId, societyId]
    );

    // 8. Create new President membership for target
    await client.query(
      `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [targetUserId, societyId, presidentRoleId, user.userId]
    );

    // 9. Demote old President to Member
    await client.query(
      `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [user.userId, societyId, memberRoleId, user.userId]
    );

    // 10. Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('PRESIDENCY_TRANSFERRED', $1, $2, 'society_membership', $3, $4, $5, $6)`,
      [
        user.userId,
        societyId,
        targetMembership.rows[0].id,
        JSON.stringify({ president: user.userId, role: 'President' }),
        JSON.stringify({ president: targetUserId, role: 'President' }),
        JSON.stringify({
          oldPresidentName: user.fullName,
          newPresidentName: targetUser.rows[0].full_name,
          initiatedBy: 'president',
        }),
      ]
    );

    // 11. Notify both users
    await client.query(
      `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
      [
        targetUserId,
        'You are now the President! 🎉',
        `${user.fullName} has transferred the presidency of ${society.rows[0].name} to you.`,
        `/society-dashboard/${societyId}`,
      ]
    );

    await client.query(
      `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
      [
        user.userId,
        'Presidency Transferred',
        `You have transferred presidency of ${society.rows[0].name} to ${targetUser.rows[0].full_name}. You are now a Member.`,
        `/society-dashboard/${societyId}`,
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Presidency transferred to ${targetUser.rows[0].full_name}`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Presidency transfer error:', error);
    return NextResponse.json({ error: 'Failed to transfer presidency' }, { status: 500 });
  } finally {
    client.release();
  }
}
