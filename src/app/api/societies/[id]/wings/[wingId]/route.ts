export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireSocietyMember, requireSocietyPrivilege } from '@/lib/rbac';

// DELETE /api/societies/[id]/wings/[wingId] — soft delete a wing (MANAGE_WINGS).
// Its portfolios stay and simply have no wing afterwards.
export async function DELETE(req: NextRequest, { params }: { params: { id: string; wingId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const { id: societyId, wingId } = params;
    const access = await requireSocietyPrivilege(user, societyId, 'MANAGE_WINGS');
    if (access instanceof NextResponse) return access;

    const wing = await query(
      'UPDATE wings SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL RETURNING name',
      [wingId, societyId],
    );
    if (wing.rows.length === 0) return ApiErrors.notFound('Wing');

    await query('UPDATE portfolios SET wing_id = NULL, updated_at = NOW() WHERE wing_id = $1', [wingId]);
    const cleared = await query(
      `UPDATE society_memberships SET wing_id = NULL, updated_at = NOW()
       WHERE wing_id = $1 AND is_active RETURNING id`,
      [wingId],
    );
    await writeAuditLog({
      action: 'WING_DELETED',
      performedBy: user.userId,
      societyId,
      targetType: 'wing',
      targetId: wingId,
      oldValue: { name: wing.rows[0].name },
    });

    return NextResponse.json({
      success: true,
      affectedMemberships: cleared.rowCount,
      message: 'Wing deleted. Its portfolios and members were kept without a wing.',
    });
  } catch (error) {
    return ApiErrors.serverError('Wing delete error:', error);
  }
}

// GET /api/societies/[id]/wings/[wingId] — wing details with portfolios
export async function GET(req: NextRequest, { params }: { params: { id: string; wingId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const { id: societyId, wingId } = params;
    const access = await requireSocietyMember(user, societyId);
    if (access instanceof NextResponse) return access;

    const wing = await query(
      `SELECT w.id, w.name, w.description, w.created_at
       FROM wings w WHERE w.id = $1 AND w.society_id = $2 AND w.deleted_at IS NULL`,
      [wingId, societyId],
    );
    if (wing.rows.length === 0) return ApiErrors.notFound('Wing');

    const portfolios = await query(
      `SELECT p.id, p.name, p.description, p.function_key, p.created_at
       FROM portfolios p WHERE p.wing_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.sort_order, p.created_at`,
      [wingId],
    );
    return NextResponse.json({ ...wing.rows[0], portfolios: portfolios.rows });
  } catch (error) {
    return ApiErrors.serverError('Wing detail error:', error);
  }
}
