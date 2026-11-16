export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { getSocietyAccess, can, canDefineOfficerPermissions, forbidden } from '@/lib/rbac';

// GET /api/societies/[id]/governance/privileges/roles/[roleId] — privileges of one role
export async function GET(req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const { id: societyId, roleId } = params;

    const access = await getSocietyAccess(user, societyId);
    if (!access) return ApiErrors.notFound('Society');
    const canEdit = await canDefineOfficerPermissions(access);
    if (!canEdit && !can(access, 'MANAGE_ROLES')) return forbidden('You cannot view role permissions.');

    const roleResult = await query(
      `SELECT id, name, tier, hierarchy_level, description FROM roles WHERE id = $1 AND society_id = $2`,
      [roleId, societyId],
    );
    const role = roleResult.rows[0];
    if (!role) return ApiErrors.notFound('Role');
    const fullAccess = role.tier === 'FACULTY_SPONSOR' || role.tier === 'ADMIN';

    const privileges = await query(
      `SELECT p.name, COALESCE(p.label, INITCAP(REPLACE(p.name, '_', ' '))) AS label, p.description, p.module,
              p.name = ANY (fn_faculty_sponsor_only_privileges()) AS fs_only,
              EXISTS (SELECT 1 FROM role_privileges rp WHERE rp.role_id = $1 AND rp.privilege_id = p.id) AS granted
       FROM privileges p
       ORDER BY p.sort_order, p.name`,
      [role.id],
    );

    return NextResponse.json({
      role_id: role.id,
      role_name: role.name,
      tier: role.tier,
      hierarchy_level: role.hierarchy_level,
      full_access: fullAccess,
      editable: canEdit && !fullAccess,
      privileges: privileges.rows.map((p) => ({
        privilege_key: p.name,
        label: p.label,
        description: p.description,
        module: p.module,
        faculty_sponsor_only: p.fs_only,
        granted: fullAccess ? (role.tier === 'FACULTY_SPONSOR' || !p.fs_only) : p.granted,
      })),
    });
  } catch (error) {
    return ApiErrors.serverError('Get role privileges error:', error);
  }
}
