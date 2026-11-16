export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable } from '@/lib/rbac';
import { cleanText, loadTeam, parseMoney } from '@/lib/event-workspace';
import { notifyUsers, teamMemberIds } from '@/lib/notify';

/**
 * POST /api/events/[id]/finance/allocations { team_id | null, amount, note }  (FR-FIN-01)
 * Allocations are append-only: to correct one, add a negative adjustment with a note.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.allocateFunds(access)) return forbidden('Only Admins (Allocate funds) can allocate money.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const amount = parseMoney(body.amount);
    if (amount === null || amount === 0) return ApiErrors.validation('Enter a non-zero amount');
    if (Math.abs(amount) > 100_000_000) return ApiErrors.validation('Amount is too large');
    const note = cleanText(body.note, 1000);
    if (amount < 0 && !note) return ApiErrors.validation('A note is required for negative adjustments');

    let team = null;
    if (body.team_id) {
      team = await loadTeam(params.id, String(body.team_id));
      if (!team) return ApiErrors.validation('That team is not part of this event');
    }

    if (amount < 0) {
      const current = await query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM fund_allocations WHERE event_id = $1 AND team_id IS NOT DISTINCT FROM $2`,
        [params.id, team?.id ?? null],
      );
      if (Number(current.rows[0].total) + amount < 0) {
        return ApiErrors.validation('This adjustment would make the allocation negative');
      }
    }

    const inserted = await query(
      `INSERT INTO fund_allocations (society_id, event_id, team_id, amount, note, allocated_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [access.event.society_id, params.id, team?.id ?? null, amount, note, user.userId],
    );
    await writeAuditLog({
      action: 'FUNDS_ALLOCATED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'fund_allocation',
      targetId: inserted.rows[0].id,
      newValue: { amount, team: team?.portfolio_name ?? 'event pool', note },
    });

    if (team) {
      await notifyUsers(await teamMemberIds(team.id, true), {
        title: `Budget ${amount > 0 ? 'allocated' : 'adjusted'}: ${team.portfolio_name}`,
        body: `Rs ${amount.toLocaleString()} ${amount > 0 ? 'allocated to' : 'adjusted for'} your team for "${access.event.title}".${note ? ` Note: ${note}` : ''}`,
        link: `/society/${access.event.society_id}/events/${params.id}/workspace?tab=finance`,
      });
    }
    return NextResponse.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Allocate funds error:', error);
  }
}
