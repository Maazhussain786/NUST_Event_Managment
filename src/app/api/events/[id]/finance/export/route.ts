export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden } from '@/lib/rbac';
import { eventBalances } from '@/lib/finance';
import { toCsv } from '@/lib/event-workspace';

/**
 * GET /api/events/[id]/finance/export?type=summary|expenses|allocations|sponsorships  (FR-FIN-07)
 * CSV download. The PDF report is the printable finance page in the app.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.viewAllFinance(access)) return forbidden('You cannot export finance reports for this event.');

    const type = req.nextUrl.searchParams.get('type') || 'summary';
    let csv: string;
    if (type === 'summary') {
      const { teams, totals } = await eventBalances(params.id);
      csv = toCsv(
        [...teams, { team_name: 'TOTAL', allocated: totals.allocated, spent: totals.spent, verified: totals.verified, pending: totals.spent - totals.verified, remaining: totals.remaining }] as unknown as Array<Record<string, unknown>>,
        [
          { key: 'team_name', label: 'Team' }, { key: 'allocated', label: 'Allocated (Rs)' },
          { key: 'spent', label: 'Spent (Rs)' }, { key: 'verified', label: 'Verified (Rs)' },
          { key: 'pending', label: 'Awaiting verification (Rs)' }, { key: 'remaining', label: 'Remaining (Rs)' },
        ],
      );
    } else if (type === 'expenses') {
      const rows = await query(
        `SELECT x.spent_on, p.name AS team, x.category, x.amount, x.description, x.status,
                su.full_name AS submitted_by, ru.full_name AS reviewed_by, x.reviewed_at, x.review_note, x.created_at
         FROM expenses x
         JOIN event_teams et ON et.id = x.team_id JOIN portfolios p ON p.id = et.portfolio_id
         JOIN users su ON su.id = x.submitted_by LEFT JOIN users ru ON ru.id = x.reviewed_by
         WHERE x.event_id = $1 ORDER BY x.spent_on, x.created_at`,
        [params.id],
      );
      csv = toCsv(rows.rows, [
        { key: 'spent_on', label: 'Date' }, { key: 'team', label: 'Team' }, { key: 'category', label: 'Category' },
        { key: 'amount', label: 'Amount (Rs)' }, { key: 'description', label: 'Description' }, { key: 'status', label: 'Status' },
        { key: 'submitted_by', label: 'Logged by' }, { key: 'reviewed_by', label: 'Reviewed by' },
        { key: 'reviewed_at', label: 'Reviewed at' }, { key: 'review_note', label: 'Review note' },
      ]);
    } else if (type === 'allocations') {
      const rows = await query(
        `SELECT fa.created_at, COALESCE(p.name, 'Event pool') AS team, fa.amount, fa.note, u.full_name AS allocated_by
         FROM fund_allocations fa JOIN users u ON u.id = fa.allocated_by
         LEFT JOIN event_teams et ON et.id = fa.team_id LEFT JOIN portfolios p ON p.id = et.portfolio_id
         WHERE fa.event_id = $1 ORDER BY fa.created_at`,
        [params.id],
      );
      csv = toCsv(rows.rows, [
        { key: 'created_at', label: 'Date' }, { key: 'team', label: 'Team' }, { key: 'amount', label: 'Amount (Rs)' },
        { key: 'note', label: 'Note' }, { key: 'allocated_by', label: 'Allocated by' },
      ]);
    } else if (type === 'sponsorships') {
      const rows = await query(
        `SELECT sp.name AS sponsor, s.amount, s.status, s.received_on, s.payment_reference, s.deliverables,
                s.deliverables_status, vu.full_name AS verified_by, s.verified_at
         FROM sponsorships s JOIN sponsors sp ON sp.id = s.sponsor_id LEFT JOIN users vu ON vu.id = s.verified_by
         WHERE s.event_id = $1 ORDER BY s.created_at`,
        [params.id],
      );
      csv = toCsv(rows.rows, [
        { key: 'sponsor', label: 'Sponsor' }, { key: 'amount', label: 'Amount (Rs)' }, { key: 'status', label: 'Status' },
        { key: 'received_on', label: 'Received on' }, { key: 'payment_reference', label: 'Reference' },
        { key: 'deliverables', label: 'Deliverables' }, { key: 'deliverables_status', label: 'Deliverables status' },
        { key: 'verified_by', label: 'Verified by' }, { key: 'verified_at', label: 'Verified at' },
      ]);
    } else {
      return ApiErrors.validation('type must be summary, expenses, allocations or sponsorships');
    }

    await writeAuditLog({
      action: 'FINANCE_EXPORTED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'event',
      targetId: params.id,
      metadata: { type },
    });
    const safeTitle = access.event.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
    return new NextResponse(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeTitle}-${type}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return ApiErrors.serverError('Finance export error:', error);
  }
}
