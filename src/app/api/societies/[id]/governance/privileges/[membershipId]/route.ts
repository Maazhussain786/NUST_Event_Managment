export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/privileges/[membershipId] — get role privileges for a member
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; membershipId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, membershipId } = params;

    // Verify requester is a member with hierarchy >= 8 (VP+) or super admin
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }
    const level = membership.rows[0]?.hierarchy_level || (user.userType === 'SUPER_ADMIN' ? 10 : 0);
    if (level < 8) {
      return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 });
    }

    // Get the target member's role
    const targetMember = await query(
      `SELECT sm.id, sm.role_id, r.name AS role_name, r.hierarchy_level,
              u.full_name, u.email
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       JOIN users u ON sm.user_id = u.id
       WHERE sm.id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [membershipId, societyId]
    );
    if (targetMember.rows.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const member = targetMember.rows[0];

    // Get all privileges
    const allPrivileges = await query(
      `SELECT id, name, description FROM privileges ORDER BY name ASC`
    );

    // Get granted privileges for this role
    const grantedPrivs = await query(
      `SELECT rp.privilege_id FROM role_privileges rp
       WHERE rp.role_id = $1`,
      [member.role_id]
    );
    const grantedSet = new Set(grantedPrivs.rows.map((r: any) => r.privilege_id));

    const privileges = allPrivileges.rows.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      granted: grantedSet.has(p.id),
    }));

    return NextResponse.json({
      membershipId: member.id,
      roleName: member.role_name,
      hierarchyLevel: member.hierarchy_level,
      fullName: member.full_name,
      email: member.email,
      privileges,
    });
  } catch (error) {
    console.error('Get privileges error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
