export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { requireSocietyMember, forbidden } from '@/lib/rbac';
import { createPortfolio } from '@/lib/portfolios';

// GET /api/societies/[id]/wings/[wingId]/portfolios — portfolios in a wing
export async function GET(req: NextRequest, { params }: { params: { id: string; wingId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyMember(user, params.id);
    if (access instanceof NextResponse) return access;

    const result = await query(
      `SELECT p.id, p.wing_id, p.name, p.description, p.function_key, p.is_event_specific, p.applies_to, p.created_at,
              u.full_name AS created_by_name,
              (SELECT COUNT(*) FROM event_teams et WHERE et.portfolio_id = p.id AND et.is_active) AS event_team_count
       FROM portfolios p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.wing_id = $1 AND p.society_id = $2 AND p.deleted_at IS NULL
       ORDER BY p.sort_order, p.created_at`,
      [params.wingId, params.id],
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    return ApiErrors.serverError('Portfolios fetch error:', error);
  }
}

// POST /api/societies/[id]/wings/[wingId]/portfolios — create a portfolio in a wing
// (MANAGE_PORTFOLIOS at society level, or an officer of this wing holding it)
export async function POST(req: NextRequest, { params }: { params: { id: string; wingId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const allowed = await query(`SELECT fn_has_privilege($1, $2, 'MANAGE_PORTFOLIOS', $3) AS ok`, [
      user.userId,
      params.id,
      params.wingId,
    ]);
    if (!allowed.rows[0]?.ok) return forbidden('You do not have permission to create portfolios in this wing.');

    const body = await req.json().catch(() => ({}));
    const created = await createPortfolio(params.id, user.userId, { ...body, wing_id: params.wingId });
    if ('error' in created) return created.error;
    return NextResponse.json(created.portfolio, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Portfolio create error:', error);
  }
}
