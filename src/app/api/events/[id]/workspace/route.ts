export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, can, rules, isSocietyAdmin, forbidden, eventIsEditable } from '@/lib/rbac';
import { parseMoney } from '@/lib/event-workspace';

/**
 * GET /api/events/[id]/workspace — everything the event workspace screen needs:
 * event details, teams with members, the caller's standing and what they may do,
 * plus a small summary (FR-LOGS-03 dashboards).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    const eventId = params.id;

    const [eventRow, teams, members, duties, finance, inventory, minutes] = await Promise.all([
      query(
        `SELECT e.id, e.society_id, s.name AS society_name, e.title, e.description, e.location, e.venue_details,
                e.event_start, e.event_end, e.status, e.archived_at, e.budget_total, e.banner_url,
                e.event_head_id, eh.full_name AS event_head_name, eh.email AS event_head_email
         FROM events e
         JOIN societies s ON s.id = e.society_id
         LEFT JOIN users eh ON eh.id = e.event_head_id
         WHERE e.id = $1`,
        [eventId],
      ),
      query(
        `SELECT et.id, et.portfolio_id, p.name AS portfolio_name, p.function_key, p.description,
                p.is_event_specific, et.is_active, et.notes
         FROM event_teams et JOIN portfolios p ON p.id = et.portfolio_id
         WHERE et.event_id = $1
         ORDER BY et.is_active DESC, p.sort_order, p.name`,
        [eventId],
      ),
      query(
        `SELECT etm.id, etm.team_id, etm.user_id, etm.team_role, etm.source, etm.assigned_at,
                u.full_name, u.email
         FROM event_team_members etm JOIN users u ON u.id = etm.user_id
         WHERE etm.event_id = $1 AND etm.removed_at IS NULL
         ORDER BY CASE etm.team_role WHEN 'TEAM_LEAD' THEN 0 ELSE 1 END, u.full_name`,
        [eventId],
      ),
      query(
        `SELECT status, COUNT(*)::int AS count FROM duties
         WHERE event_id = $1 AND deleted_at IS NULL GROUP BY status`,
        [eventId],
      ),
      query(
        `SELECT
           COALESCE((SELECT SUM(amount) FROM fund_allocations WHERE event_id = $1), 0) AS allocated,
           COALESCE((SELECT SUM(amount) FROM expenses WHERE event_id = $1 AND status <> 'REJECTED'), 0) AS spent,
           COALESCE((SELECT SUM(amount) FROM sponsorships WHERE event_id = $1 AND status IN ('CONFIRMED', 'RECEIVED')), 0) AS sponsorship`,
        [eventId],
      ),
      query(`SELECT COUNT(*)::int AS pending FROM inventory_requests WHERE event_id = $1 AND status = 'PENDING'`, [eventId]),
      query(
        `SELECT COUNT(*)::int AS awaiting FROM minutes_sheets
         WHERE event_id = $1 AND deleted_at IS NULL AND status = 'SUBMITTED'`,
        [eventId],
      ),
    ]);

    const membersByTeam = new Map<string, unknown[]>();
    for (const m of members.rows) {
      const list = membersByTeam.get(m.team_id) ?? [];
      list.push(m);
      membersByTeam.set(m.team_id, list);
    }

    const showFinance = rules.viewAllFinance(access);
    return NextResponse.json({
      event: eventRow.rows[0],
      teams: teams.rows.map((t) => ({ ...t, members: membersByTeam.get(t.id) ?? [] })),
      me: {
        user_id: user.userId,
        is_event_head: access.isEventHead,
        society_role: access.society.roleName,
        tier: access.society.tier,
        teams: access.teams,
        can: {
          manage_teams: rules.manageTeams(access),
          edit_plan: rules.editPlan(access),
          manage_any_recruitment: can(access.society, 'MANAGE_RECRUITMENT'),
          view_all_recruitment: rules.viewAllRecruitment(access),
          manage_any_duties: rules.manageDutiesFor(access, null),
          view_all_duties: rules.viewAllDuties(access),
          allocate_funds: rules.allocateFunds(access),
          verify_money: rules.verifyMoney(access),
          view_all_finance: showFinance,
          manage_sponsors: rules.manageSponsorsForEvent(access),
          view_sponsors: rules.viewSponsorsForEvent(access),
          manage_inventory: rules.manageInventoryForEvent(access),
          create_minutes: rules.createMinutesFor(access, null) || access.teams.some((t) => t.teamRole === 'TEAM_LEAD'),
          check_in: rules.checkIn(access),
          view_registrations: rules.viewRegistrations(access),
          archive: can(access.society, 'CANCEL_EVENT'),
          is_admin: isSocietyAdmin(access.society),
        },
        editable: eventIsEditable(access),
      },
      summary: {
        duties: Object.fromEntries(duties.rows.map((d) => [d.status, d.count])),
        finance: showFinance
          ? {
              allocated: Number(finance.rows[0].allocated),
              spent: Number(finance.rows[0].spent),
              sponsorship: Number(finance.rows[0].sponsorship),
              remaining: Number(finance.rows[0].allocated) - Number(finance.rows[0].spent),
            }
          : null,
        pending_inventory_requests: inventory.rows[0].pending,
        minutes_awaiting_approval: minutes.rows[0].awaiting,
      },
    });
  } catch (error) {
    return ApiErrors.serverError('Event workspace error:', error);
  }
}

/** PATCH /api/events/[id]/workspace { budget_total } — set the event budget outline (FR-EVT-02). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!can(access.society, 'MANAGE_FINANCE') && !can(access.society, 'EDIT_EVENT')) return forbidden();
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const budget = body.budget_total === null || body.budget_total === '' ? null : parseMoney(body.budget_total);
    if (body.budget_total !== null && body.budget_total !== '' && (budget === null || budget < 0)) {
      return ApiErrors.validation('Budget must be a positive amount');
    }
    const old = await query('SELECT budget_total FROM events WHERE id = $1', [params.id]);
    await query('UPDATE events SET budget_total = $2, updated_at = NOW() WHERE id = $1', [params.id, budget]);
    await writeAuditLog({
      action: 'EVENT_BUDGET_SET',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'event',
      targetId: params.id,
      oldValue: { budget_total: old.rows[0]?.budget_total ?? null },
      newValue: { budget_total: budget },
    });
    return NextResponse.json({ success: true, budget_total: budget });
  } catch (error) {
    return ApiErrors.serverError('Event budget error:', error);
  }
}
