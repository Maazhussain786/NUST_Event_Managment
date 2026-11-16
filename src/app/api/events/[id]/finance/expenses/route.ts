export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable, FUNCTION } from '@/lib/rbac';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';
import { cleanText, isUuid, loadTeam, parseDateOnly, parseMoney } from '@/lib/event-workspace';
import { EXPENSE_CATEGORIES, alertIfOverBudget, teamSpendVsAllocation } from '@/lib/finance';
import { notifyUsers, usersInEventFunction } from '@/lib/notify';

// GET /api/events/[id]/finance/expenses?team_id=&status= — expenses visible to the caller
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;

    const full = rules.viewAllFinance(access);
    const ledTeams = access.teams.filter((t) => t.teamRole === 'TEAM_LEAD').map((t) => t.teamId);
    if (!full && ledTeams.length === 0) return forbidden('You cannot view expenses for this event.');

    const teamFilter = req.nextUrl.searchParams.get('team_id');
    const status = req.nextUrl.searchParams.get('status');
    const result = await query(
      `SELECT x.id, x.team_id, p.name AS team_name, x.amount, x.category, x.spent_on, x.description, x.receipt_url,
              x.status, x.review_note, x.reviewed_at, x.created_at,
              x.submitted_by, su.full_name AS submitted_by_name, ru.full_name AS reviewed_by_name
       FROM expenses x
       JOIN event_teams et ON et.id = x.team_id
       JOIN portfolios p ON p.id = et.portfolio_id
       JOIN users su ON su.id = x.submitted_by
       LEFT JOIN users ru ON ru.id = x.reviewed_by
       WHERE x.event_id = $1 AND ($2::boolean OR x.team_id = ANY($3::uuid[]))
         AND ($4::uuid IS NULL OR x.team_id = $4)
         AND ($5::text IS NULL OR x.status = $5)
       ORDER BY x.created_at DESC`,
      [params.id, full, ledTeams, isUuid(teamFilter) ? teamFilter : null,
        status && ['SUBMITTED', 'VERIFIED', 'REJECTED'].includes(status) ? status : null],
    );
    const canVerify = rules.verifyMoney(access) && eventIsEditable(access);
    return NextResponse.json({
      expenses: result.rows.map((x) => ({
        ...x,
        receipt_url: x.receipt_url
          ? resolveMediaUrl(x.receipt_url, { container: CONTAINERS.NOTE_ATTACHMENTS, expiresInMinutes: 60 }) || null
          : null,
        can_review: canVerify && x.status === 'SUBMITTED' && x.submitted_by !== user.userId,
      })),
      categories: EXPENSE_CATEGORIES,
    });
  } catch (error) {
    return ApiErrors.serverError('List expenses error:', error);
  }
}

/**
 * POST /api/events/[id]/finance/expenses { team_id, amount, category, spent_on, description, receipt_url? }
 * Team Leads log their team's expenses (FR-FIN-03); Finance sees them (FR-FIN-04).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const team = body.team_id ? await loadTeam(params.id, String(body.team_id)) : null;
    if (!team) return ApiErrors.validation('Choose the team this expense belongs to');
    if (!rules.logExpenseFor(access, team.id)) return forbidden('Only the team\'s Team Lead can log its expenses.');

    const amount = parseMoney(body.amount);
    if (amount === null || amount <= 0) return ApiErrors.validation('Amount must be greater than zero');
    if (amount > 10_000_000) return ApiErrors.validation('Amount is too large');
    const category = String(body.category || '').toUpperCase();
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return ApiErrors.validation('Choose a category');
    const spentOn = parseDateOnly(body.spent_on);
    if (!spentOn) return ApiErrors.validation('Date must be YYYY-MM-DD');
    if (spentOn > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) return ApiErrors.validation('Date cannot be in the future');
    const description = cleanText(body.description, 2000);
    if (!description) return ApiErrors.validation('Describe the expense');
    const receiptUrl = cleanText(body.receipt_url, 1000);
    if (receiptUrl && !/^https:\/\/[^\s]+$/i.test(receiptUrl)) return ApiErrors.validation('Invalid receipt link');

    const before = await teamSpendVsAllocation(team.id);
    const inserted = await query(
      `INSERT INTO expenses (society_id, event_id, team_id, amount, category, spent_on, description, receipt_url, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [access.event.society_id, params.id, team.id, amount, category, spentOn, description, receiptUrl, user.userId],
    );
    await writeAuditLog({
      action: 'EXPENSE_LOGGED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'expense',
      targetId: inserted.rows[0].id,
      newValue: { amount, category, team: team.portfolio_name, spent_on: spentOn },
    });

    const overBudget = await alertIfOverBudget({
      societyId: access.event.society_id,
      eventId: params.id,
      eventTitle: access.event.title,
      teamId: team.id,
      teamName: team.portfolio_name,
      spentBefore: before.spent,
    });
    await notifyUsers(await usersInEventFunction(params.id, FUNCTION.FINANCE, true), {
      title: `Expense to verify: ${team.portfolio_name}`,
      body: `${user.fullName} logged Rs ${amount.toLocaleString()} (${category.toLowerCase()}) for "${access.event.title}".`,
      link: `/society/${access.event.society_id}/events/${params.id}/workspace?tab=finance`,
      push: false,
    });
    return NextResponse.json({ success: true, id: inserted.rows[0].id, over_budget: overBudget }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Log expense error:', error);
  }
}
