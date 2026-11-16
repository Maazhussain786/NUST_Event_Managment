export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireSocietyMember, canDefineOfficerPermissions, forbidden } from '@/lib/rbac';

async function loadOfficerRole(societyId: string, roleId: string) {
  const result = await query(
    `SELECT id, name, description, tier, hierarchy_level, max_holders, is_system_role
     FROM roles WHERE id = $1 AND society_id = $2`,
    [roleId, societyId],
  );
  return result.rows[0] ?? null;
}

// PATCH /api/societies/[id]/roles/[roleId] — rename / re-rank an Officer role
export async function PATCH(req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyMember(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!(await canDefineOfficerPermissions(access))) return forbidden('Only the Faculty Sponsor can edit Officer roles.');

    const role = await loadOfficerRole(params.id, params.roleId);
    if (!role) return ApiErrors.notFound('Role');
    if (role.tier !== 'OFFICER') return forbidden('Only Officer roles can be edited.');

    const body = await req.json().catch(() => ({}));
    const name = body.name !== undefined ? String(body.name).trim() : role.name;
    const description = body.description !== undefined ? String(body.description).trim() || null : role.description;
    const level = body.hierarchy_level !== undefined ? Number(body.hierarchy_level) : role.hierarchy_level;
    const maxHolders = body.max_holders === undefined ? role.max_holders
      : body.max_holders === null || body.max_holders === '' ? null : Number(body.max_holders);

    if (name.length < 2 || name.length > 100) return ApiErrors.validation('Role name must be 2-100 characters');
    if (!Number.isInteger(level) || level < 20 || level > 80) return ApiErrors.validation('Officer rank must be between 20 and 80');
    if (maxHolders !== null && (!Number.isInteger(maxHolders) || maxHolders < 1)) {
      return ApiErrors.validation('Maximum holders must be a positive whole number');
    }
    if (name.toLowerCase() !== role.name.toLowerCase()) {
      const clash = await query('SELECT 1 FROM roles WHERE society_id = $1 AND LOWER(name) = LOWER($2)', [params.id, name]);
      if (clash.rows.length > 0) return ApiErrors.conflict('A role with this name already exists');
    }

    const updated = await query(
      `UPDATE roles SET name = $3, description = $4, hierarchy_level = $5, max_holders = $6, updated_at = NOW()
       WHERE id = $1 AND society_id = $2
       RETURNING id, name, description, tier, hierarchy_level, max_holders, is_system_role`,
      [params.roleId, params.id, name, description, level, maxHolders],
    );
    await writeAuditLog({
      action: 'ROLE_UPDATED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'role',
      targetId: params.roleId,
      oldValue: { name: role.name, level: role.hierarchy_level, maxHolders: role.max_holders },
      newValue: { name, level, maxHolders },
    });
    return NextResponse.json({ success: true, role: updated.rows[0] });
  } catch (error) {
    return ApiErrors.serverError('Update role error:', error);
  }
}

// DELETE /api/societies/[id]/roles/[roleId] — delete an unused Officer role
export async function DELETE(req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyMember(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!(await canDefineOfficerPermissions(access))) return forbidden('Only the Faculty Sponsor can delete Officer roles.');

    const role = await loadOfficerRole(params.id, params.roleId);
    if (!role) return ApiErrors.notFound('Role');
    if (role.tier !== 'OFFICER' || role.is_system_role) return forbidden('This role cannot be deleted.');

    const used = await query('SELECT 1 FROM society_memberships WHERE role_id = $1 LIMIT 1', [params.roleId]);
    if (used.rows.length > 0) {
      return ApiErrors.conflict('This role has (or had) holders. Move them to another role first; past holders keep the history.');
    }
    await query('DELETE FROM roles WHERE id = $1 AND society_id = $2', [params.roleId, params.id]);
    await writeAuditLog({
      action: 'ROLE_DELETED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'role',
      targetId: params.roleId,
      oldValue: { name: role.name },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Delete role error:', error);
  }
}
