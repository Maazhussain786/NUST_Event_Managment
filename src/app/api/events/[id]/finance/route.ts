export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden } from '@/lib/rbac';
import { eventBalances } from '@/lib/finance';

/**
 * GET /api/events/[id]/finance — dashboard: allocated vs spent vs remaining per team
 * and for the event, sponsorship and ticket income, over-budget teams (FR-FIN-05/06).
 * Full view: Admin / Finance portfolio / Event Head / VIEW_FINANCE. Team Leads see their own teams.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;

    const full = rules.viewAllFinance(access);
    const ledTeams = access.teams.filter((t) => t.teamRole === 'TEAM_LEAD').map((t) => t.teamId);
    if (!full && ledTeams.length === 0) return forbidden('You cannot view finances for this event.');

    const balances = await eventBalances(params.id);
    const allocations = await query(
      `SELECT fa.id, fa.team_id, p.name AS team_name, fa.amount, fa.note, fa.created_at, u.full_name AS allocated_by_name
       FROM fund_allocations fa
       JOIN users u ON u.id = fa.allocated_by
       LEFT JOIN event_teams et ON et.id = fa.team_id
       LEFT JOIN portfolios p ON p.id = et.portfolio_id
       WHERE fa.event_id = $1 AND ($2::boolean OR fa.team_id = ANY($3::uuid[]))
       ORDER BY fa.created_at DESC`,
      [params.id, full, ledTeams],
    );

    return NextResponse.json({
      full_view: full,
      teams: full ? balances.teams : balances.teams.filter((t) => t.team_id && ledTeams.includes(t.team_id)),
      totals: full ? balances.totals : null,
      allocations: allocations.rows,
      can: {
        allocate: rules.allocateFunds(access),
        verify: rules.verifyMoney(access),
        log_expense_for: ledTeams.concat(rules.allocateFunds(access) ? balances.teams.filter((t) => t.team_id).map((t) => t.team_id as string) : []),
      },
    });
  } catch (error) {
    return ApiErrors.serverError('Event finance error:', error);
  }
}
