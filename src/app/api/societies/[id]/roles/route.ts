export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireSocietyMember, canDefineOfficerPermissions, forbidden, TIER_LABELS, type SocietyTier } from '@/lib/rbac';

// GET /api/societies/[id]/roles — roles of a society (highest first) with holder counts
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyMember(user, params.id);
    if (access instanceof NextResponse) return access;

    // Make sure every default role exists (idempotent; uses role_templates).
    await query('SELECT fn_seed_society_roles($1)', [params.id]);

    const result = await query(
      `SELECT r.id, r.name, r.description, r.hierarchy_level, r.is_system_role, r.tier, r.max_holders, r.created_at,
              COUNT(sm.id) FILTER (WHERE sm.is_active)::int AS holder_count
       FROM roles r
       LEFT JOIN society_memberships sm ON sm.role_id = r.id
       WHERE r.society_id = $1
       GROUP BY r.id
       ORDER BY r.hierarchy_level DESC, r.name`,
      [params.id],
    );
    return NextResponse.json(
      result.rows.map((r) => ({ ...r, tier_label: TIER_LABELS[r.tier as SocietyTier] })),
    );
  } catch (error) {
    return ApiErrors.serverError('Roles fetch error:', error);
  }
}

// POST /api/societies/[id]/roles — Faculty Sponsor creates an Officer role (FR-ROLE-03)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyMember(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!(await canDefineOfficerPermissions(access))) return forbidden('Only the Faculty Sponsor can define Officer roles.');

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim() || null;
    const level = Number(body.hierarchy_level ?? 60);
    const maxHolders = body.max_holders === null || body.max_holders === undefined || body.max_holders === ''
      ? null : Number(body.max_holders);

    if (name.length < 2 || name.length > 100) return ApiErrors.validation('Role name must be 2-100 characters');
    if (!Number.isInteger(level) || level < 20 || level > 80) {
      return ApiErrors.validation('Officer rank must be between 20 and 80');
    }
    if (maxHolders !== null && (!Number.isInteger(maxHolders) || maxHolders < 1)) {
      return ApiErrors.validation('Maximum holders must be a positive whole number');
    }

    const existing = await query('SELECT 1 FROM roles WHERE society_id = $1 AND LOWER(name) = LOWER($2)', [params.id, name]);
    if (existing.rows.length > 0) return ApiErrors.conflict('A role with this name already exists');

    const inserted = await query(
      `INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role, tier, max_holders)
       VALUES ($1, $2, $3, $4, FALSE, 'OFFICER', $5)
       RETURNING id, name, description, hierarchy_level, is_system_role, tier, max_holders`,
      [params.id, name, description, level, maxHolders],
    );

    const privileges: string[] = Array.isArray(body.privileges) ? body.privileges.map(String) : [];
    if (privileges.length > 0) {
      await query(
        `INSERT INTO role_privileges (role_id, privilege_id, granted_by)
         SELECT $1, p.id, $3 FROM privileges p
         WHERE p.name = ANY($2::text[]) AND NOT (p.name = ANY (fn_faculty_sponsor_only_privileges()))
         ON CONFLICT DO NOTHING`,
        [inserted.rows[0].id, privileges, user.userId],
      );
    }

    await writeAuditLog({
      action: 'ROLE_CREATED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'role',
      targetId: inserted.rows[0].id,
      newValue: { name, level, maxHolders, privileges },
    });

    return NextResponse.json({ success: true, role: inserted.rows[0] }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Create role error:', error);
  }
}
