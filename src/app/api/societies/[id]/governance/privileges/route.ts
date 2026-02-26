export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// PATCH /api/societies/[id]/governance/privileges — toggle a privilege for a member's role
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;
    const body = await req.json();
    const { membershipId, privilegeKey, granted } = body;

    if (!membershipId || !privilegeKey || typeof granted !== 'boolean') {
      return NextResponse.json({ error: 'membershipId, privilegeKey, and granted are required' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Verify requester is VP+ (hierarchy >= 8) or super admin
    const membership = await client.query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }
    const level = membership.rows[0]?.hierarchy_level || (user.userType === 'SUPER_ADMIN' ? 10 : 0);
    if (level < 8) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 });
    }

    // Get the target member's role
    const targetMember = await client.query(
      `SELECT sm.role_id, r.name AS role_name, r.hierarchy_level
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [membershipId, societyId]
    );
    if (targetMember.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Cannot modify privileges of someone with equal or higher hierarchy
    if (targetMember.rows[0].hierarchy_level >= level && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cannot modify privileges of equal or higher rank' }, { status: 403 });
    }

    // Get privilege ID
    const privResult = await client.query(
      `SELECT id FROM privileges WHERE name = $1`,
      [privilegeKey]
    );
    if (privResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Privilege not found' }, { status: 404 });
    }

    const privilegeId = privResult.rows[0].id;
    const roleId = targetMember.rows[0].role_id;

    if (granted) {
      // Grant
      await client.query(
        `INSERT INTO role_privileges (role_id, privilege_id, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, privilege_id) DO NOTHING`,
        [roleId, privilegeId, user.userId]
      );
    } else {
      // Revoke
      await client.query(
        `DELETE FROM role_privileges WHERE role_id = $1 AND privilege_id = $2`,
        [roleId, privilegeId]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ('PRIVILEGE_UPDATED', $1, $2, 'role_privilege', $3, $4, $5)`,
      [
        user.userId,
        societyId,
        roleId,
        JSON.stringify({ privilege: privilegeKey, granted }),
        JSON.stringify({ role: targetMember.rows[0].role_name, by: user.fullName }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update privilege error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
