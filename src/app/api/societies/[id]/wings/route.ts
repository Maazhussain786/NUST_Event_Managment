export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireSocietyMember, requireSocietyPrivilege } from '@/lib/rbac';

/**
 * Wings are optional groupings of portfolios led by an Officer such as a VP
 * (FR-TEAM-02). Creating a wing never changes anyone's permissions: Officer
 * permissions are set only by the Faculty Sponsor (FR-ROLE-03).
 */

// GET /api/societies/[id]/wings — list wings
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyMember(user, params.id);
    if (access instanceof NextResponse) return access;

    const result = await query(
      `SELECT w.id, w.name, w.description, w.created_at,
              u.full_name AS created_by_name,
              (SELECT COUNT(DISTINCT sm.user_id) FROM society_memberships sm
               WHERE sm.wing_id = w.id AND sm.is_active) AS member_count,
              (SELECT COUNT(*) FROM portfolios p WHERE p.wing_id = w.id AND p.deleted_at IS NULL) AS portfolio_count,
              (SELECT u2.full_name FROM society_memberships sm2
               JOIN users u2 ON u2.id = sm2.user_id
               JOIN roles r ON r.id = sm2.role_id
               WHERE sm2.wing_id = w.id AND sm2.is_active AND r.tier = 'OFFICER'
               ORDER BY r.hierarchy_level DESC LIMIT 1) AS vp_name
       FROM wings w
       LEFT JOIN users u ON w.created_by = u.id
       WHERE w.society_id = $1 AND w.deleted_at IS NULL
       ORDER BY w.created_at`,
      [params.id],
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    return ApiErrors.serverError('Wings fetch error:', error);
  }
}

// POST /api/societies/[id]/wings — create a wing (MANAGE_WINGS)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyPrivilege(user, params.id, 'MANAGE_WINGS');
    if (access instanceof NextResponse) return access;

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    if (!name) return ApiErrors.validation('Wing name required');
    if (name.length > 200) return ApiErrors.validation('Wing name is too long');

    const result = await query(
      `INSERT INTO wings (society_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, name, description, created_at`,
      [params.id, name, String(body.description || ''), user.userId],
    );
    await writeAuditLog({
      action: 'WING_CREATED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'wing',
      targetId: result.rows[0].id,
      newValue: { name },
    });
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') return ApiErrors.conflict('Wing name already exists');
    return ApiErrors.serverError('Wing create error:', error);
  }
}
