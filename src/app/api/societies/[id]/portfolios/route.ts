export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { requireSocietyPrivilege } from '@/lib/rbac';
import { createPortfolio } from '@/lib/portfolios';

/**
 * The society's portfolio catalog (FR-TEAM-01/03). Readable by anyone signed in
 * (the account-request form needs it); managed with MANAGE_PORTFOLIOS.
 */

// GET /api/societies/[id]/portfolios
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const result = await query(
      `SELECT p.id, p.wing_id, w.name AS wing_name, p.name, p.description, p.function_key,
              p.is_event_specific, p.applies_to, p.sort_order
       FROM portfolios p
       JOIN societies s ON s.id = p.society_id AND s.deleted_at IS NULL
       LEFT JOIN wings w ON w.id = p.wing_id AND w.deleted_at IS NULL
       WHERE p.society_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.sort_order, p.name`,
      [params.id],
    );
    return NextResponse.json({ portfolios: result.rows });
  } catch (error) {
    return ApiErrors.serverError('Portfolio catalog error:', error);
  }
}

// POST /api/societies/[id]/portfolios — add a portfolio (wing optional)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyPrivilege(user, params.id, 'MANAGE_PORTFOLIOS');
    if (access instanceof NextResponse) return access;

    const created = await createPortfolio(params.id, user.userId, await req.json().catch(() => ({})));
    if ('error' in created) return created.error;
    return NextResponse.json(created.portfolio, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Portfolio create error:', error);
  }
}
