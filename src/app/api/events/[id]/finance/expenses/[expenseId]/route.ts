export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable } from '@/lib/rbac';
import { cleanText, isUuid } from '@/lib/event-workspace';
import { notifyUser } from '@/lib/notify';

/**
 * PATCH /api/events/[id]/finance/expenses/[expenseId] { action: VERIFY | REJECT, note? }
 * Finance (Finance-portfolio Team Lead or VERIFY_EXPENSES) reviews expenses (SRS 4.9 step 4).
 * Nobody verifies their own expense. Reviewed expenses are locked by the database.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; expenseId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    if (!isUuid(params.expenseId)) return ApiErrors.notFound('Expense');
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.verifyMoney(access)) return forbidden('Only Finance can verify expenses.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase();
    if (action !== 'VERIFY' && action !== 'REJECT') return ApiErrors.validation('action must be VERIFY or REJECT');
    const note = cleanText(body.note, 1000);
    if (action === 'REJECT' && !note) return ApiErrors.validation('Give a reason for rejecting');

    const result = await query(
      `UPDATE expenses SET status = $3, reviewed_by = $4, reviewed_at = NOW(), review_note = $5
       WHERE id = $1 AND event_id = $2 AND status = 'SUBMITTED' AND submitted_by <> $4
       RETURNING id, submitted_by, amount, description`,
      [params.expenseId, params.id, action === 'VERIFY' ? 'VERIFIED' : 'REJECTED', user.userId, note],
    );
    const expense = result.rows[0];
    if (!expense) {
      const exists = await query('SELECT status, submitted_by FROM expenses WHERE id = $1 AND event_id = $2', [params.expenseId, params.id]);
      if (exists.rows.length === 0) return ApiErrors.notFound('Expense');
      if (exists.rows[0].submitted_by === user.userId) return forbidden('You cannot review your own expense.');
      return ApiErrors.conflict(`This expense is already ${String(exists.rows[0].status).toLowerCase()}.`);
    }

    await writeAuditLog({
      action: action === 'VERIFY' ? 'EXPENSE_VERIFIED' : 'EXPENSE_REJECTED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'expense',
      targetId: expense.id,
      newValue: { amount: expense.amount, note },
    });
    await notifyUser(expense.submitted_by, {
      title: action === 'VERIFY' ? 'Expense verified' : 'Expense rejected',
      body: `Your expense "${expense.description}" (Rs ${Number(expense.amount).toLocaleString()}) was ${action === 'VERIFY' ? 'verified' : `rejected: ${note}`}.`,
      link: `/society/${access.event.society_id}/events/${params.id}/workspace?tab=finance`,
      email: action === 'REJECT',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Review expense error:', error);
  }
}
