export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const DEFAULT_ROLE_PRIVILEGES: Record<string, string[]> = {
  'Vice President': [
    'CREATE_EVENT', 'EDIT_EVENT', 'CANCEL_EVENT', 'VERIFY_PAYMENTS',
    'UPLOAD_CONTENT', 'DELETE_CONTENT', 'SEND_MESSAGE', 'VIEW_CHAT',
    'MANAGE_CHAT', 'MANAGE_MEMBERS', 'MANAGE_PORTFOLIOS', 'SCAN_QR',
    'VIEW_ANALYTICS', 'MANAGE_ROLES',
  ],
  'Director': [
    'CREATE_EVENT', 'EDIT_EVENT', 'UPLOAD_CONTENT',
    'SEND_MESSAGE', 'VIEW_CHAT', 'SCAN_QR', 'VIEW_ANALYTICS',
  ],
  'Deputy Director': [
    'UPLOAD_CONTENT', 'SEND_MESSAGE', 'VIEW_CHAT', 'SCAN_QR',
  ],
  'Member': [
    'SEND_MESSAGE', 'VIEW_CHAT', 'TRANSFER_TICKET',
  ],
};

async function ensureDefaultRolePrivileges(societyId: string) {
  const roleRows = await query(
    `SELECT id, name FROM roles WHERE society_id = $1`,
    [societyId]
  );

  for (const role of roleRows.rows as Array<{ id: string; name: string }>) {
    const defaults = DEFAULT_ROLE_PRIVILEGES[role.name];
    if (!defaults || defaults.length === 0) continue;

    await query(
      `INSERT INTO role_privileges (role_id, privilege_id)
       SELECT $1, p.id
       FROM privileges p
       WHERE p.name = ANY($2::text[])
       ON CONFLICT (role_id, privilege_id) DO NOTHING`,
      [role.id, defaults]
    );
  }
}

function toPrivilegeLabel(key: string) {
  return key
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// GET /api/societies/[id]/governance/privileges/roles/[roleId] — get privileges for a role
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; roleId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, roleId } = params;

    await ensureDefaultRolePrivileges(societyId);

    const membership = await query(
      `SELECT r.hierarchy_level, r.name AS role_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
       ORDER BY r.hierarchy_level DESC
       LIMIT 1`,
      [user.userId, societyId]
    );

    const myRoleName = membership.rows[0]?.role_name || null;
    if (user.userType !== 'SUPER_ADMIN' && myRoleName !== 'President') {
      return NextResponse.json({ error: 'Only President can view role permissions' }, { status: 403 });
    }

    const roleResult = await query(
      `SELECT id, name, hierarchy_level
       FROM roles
       WHERE id = $1 AND society_id = $2`,
      [roleId, societyId]
    );

    if (roleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const role = roleResult.rows[0];

    const allPrivileges = await query(`SELECT id, name, description FROM privileges ORDER BY name ASC`);
    const grantedPrivs = await query(
      `SELECT privilege_id FROM role_privileges WHERE role_id = $1`,
      [role.id]
    );

    const grantedSet = new Set(grantedPrivs.rows.map((r: { privilege_id: string }) => r.privilege_id));

    return NextResponse.json({
      role_id: role.id,
      role_name: role.name,
      hierarchy_level: role.hierarchy_level,
      privileges: allPrivileges.rows.map((p: { id: string; name: string; description: string }) => ({
        privilege_key: p.name,
        label: toPrivilegeLabel(p.name),
        description: p.description,
        granted: grantedSet.has(p.id),
      })),
    });
  } catch (error) {
    console.error('Get role privileges error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
