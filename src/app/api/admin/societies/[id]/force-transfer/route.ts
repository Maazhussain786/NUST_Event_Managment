export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/admin/societies/[id]/force-transfer
 *
 * SuperAdmin-forced presidency transfer.
 * Auth: SUPER_ADMIN only.
 * Body: { targetUserId: string, reason: string }
 *
 * Forcibly removes the current President and assigns a new one.
 * No acceptance required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden — SuperAdmin only' }, { status: 403 });
    }

    const { id: societyId } = params;
    const body = await req.json();
    const { targetUserId, reason } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }
    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason is required for forced transfers' }, { status: 400 });
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

    // 2. Find current President
    const currentPres = await client.query(
      `SELECT sm.id, sm.user_id, r.id as role_id
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.society_id = $1 AND r.name = 'President' AND sm.is_active = TRUE`,
      [societyId]
    );
    const oldPresidentUserId = currentPres.rows.length > 0 ? currentPres.rows[0].user_id : null;
    const oldPresidentMembershipId = currentPres.rows.length > 0 ? currentPres.rows[0].id : null;

    // 3. Verify target user exists
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

    // 4. Get role IDs
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

    // 5. Deactivate current President's membership (if exists)
    if (oldPresidentMembershipId) {
      await client.query(
        `UPDATE society_memberships SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1`,
        [oldPresidentMembershipId]
      );

      // Demote old President to Member
      await client.query(
        `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
         VALUES ($1, $2, $3, TRUE, $4)`,
        [oldPresidentUserId, societyId, memberRoleId, user.userId]
      );
    }

    // 6. Deactivate target's current memberships (if any — avoid unique constraint)
    await client.query(
      `UPDATE society_memberships SET is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND society_id = $2 AND is_active = TRUE`,
      [targetUserId, societyId]
    );

    // 7. Create new President membership for target
    await client.query(
      `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [targetUserId, societyId, presidentRoleId, user.userId]
    );

    // 8. Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, $2, 'society_membership', $3, $4, $5, $6)`,
      [
        user.userId,
        societyId,
        targetUserId,
        JSON.stringify({ president: oldPresidentUserId }),
        JSON.stringify({ president: targetUserId }),
        JSON.stringify({
          subAction: 'FORCED_PRESIDENCY_TRANSFER',
          reason: reason.trim(),
          oldPresidentUserId,
          newPresidentName: targetUser.rows[0].full_name,
        }),
      ]
    );

    // 9. Notify target
    await client.query(
      `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
      [
        targetUserId,
        'You have been appointed President',
        `A SuperAdmin has appointed you as President of ${society.rows[0].name}.`,
        `/society/${societyId}/dashboard`,
      ]
    );

    // 10. Notify old President (if existed)
    if (oldPresidentUserId) {
      await client.query(
        `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
        [
          oldPresidentUserId,
          'Presidency Transferred by Admin',
          `A SuperAdmin has transferred your presidency of ${society.rows[0].name}. Reason: ${reason.trim()}`,
          `/society/${societyId}/dashboard`,
        ]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Presidency forcibly transferred to ${targetUser.rows[0].full_name}`,
      oldPresident: oldPresidentUserId,
      newPresident: targetUserId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Force transfer error:', error);
    return NextResponse.json({ error: 'Failed to force transfer presidency' }, { status: 500 });
  } finally {
    client.release();
  }
}
