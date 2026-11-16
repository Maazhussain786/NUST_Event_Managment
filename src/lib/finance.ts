import { query } from './db';
import { notifyUsers, teamMemberIds, usersInEventFunction, usersWithSocietyPrivilege } from './notify';
import { FUNCTION } from './rbac';

/** Finance (FR-FIN-01..07). Money is always NUMERIC in SQL; convert to numbers only for display. */

export const EXPENSE_CATEGORIES = [
  'VENUE', 'FOOD', 'PRINTING', 'TRANSPORT', 'DECOR', 'EQUIPMENT',
  'MARKETING', 'HONORARIUM', 'PRIZES', 'MERCHANDISE', 'MISC',
] as const;

export interface TeamBalance {
  team_id: string | null;
  team_name: string;
  allocated: number;
  spent: number;          // submitted + verified (rejected excluded)
  verified: number;
  pending: number;
  remaining: number;
  over_budget: boolean;
}

/** Allocated / spent / remaining per team (and the event-level pool) for one event (FR-FIN-05). */
export async function eventBalances(eventId: string): Promise<{ teams: TeamBalance[]; totals: Record<string, number> }> {
  const result = await query(
    `WITH alloc AS (
       SELECT team_id, SUM(amount) AS allocated FROM fund_allocations WHERE event_id = $1 GROUP BY team_id
     ), spend AS (
       SELECT team_id,
              SUM(amount) FILTER (WHERE status <> 'REJECTED') AS spent,
              SUM(amount) FILTER (WHERE status = 'VERIFIED') AS verified,
              SUM(amount) FILTER (WHERE status = 'SUBMITTED') AS pending
       FROM expenses WHERE event_id = $1 GROUP BY team_id
     ), teams AS (
       SELECT et.id AS team_id, p.name AS team_name, p.sort_order
       FROM event_teams et JOIN portfolios p ON p.id = et.portfolio_id
       WHERE et.event_id = $1
     )
     SELECT t.team_id, t.team_name,
            COALESCE(a.allocated, 0) AS allocated, COALESCE(s.spent, 0) AS spent,
            COALESCE(s.verified, 0) AS verified, COALESCE(s.pending, 0) AS pending
     FROM teams t
     LEFT JOIN alloc a ON a.team_id = t.team_id
     LEFT JOIN spend s ON s.team_id = t.team_id
     UNION ALL
     SELECT NULL, 'Event pool (unassigned)', COALESCE((SELECT allocated FROM alloc WHERE team_id IS NULL), 0), 0, 0, 0
     ORDER BY 2`,
    [eventId],
  );
  const teams: TeamBalance[] = result.rows.map((r) => {
    const allocated = Number(r.allocated);
    const spent = Number(r.spent);
    return {
      team_id: r.team_id,
      team_name: r.team_name,
      allocated,
      spent,
      verified: Number(r.verified),
      pending: Number(r.pending),
      remaining: allocated - spent,
      over_budget: r.team_id !== null && spent > allocated,
    };
  });

  const income = await query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status IN ('CONFIRMED', 'RECEIVED')), 0) AS sponsorship_committed,
            COALESCE(SUM(amount) FILTER (WHERE status = 'RECEIVED' AND verified_at IS NOT NULL), 0) AS sponsorship_received,
            COALESCE((SELECT SUM(e.ticket_price) FROM tickets t JOIN events e ON e.id = t.event_id
                      WHERE t.event_id = $1 AND t.status = 'APPROVED'), 0) AS ticket_revenue,
            (SELECT budget_total FROM events WHERE id = $1) AS budget_total
     FROM sponsorships WHERE event_id = $1`,
    [eventId],
  );
  const allocated = teams.reduce((sum, t) => sum + t.allocated, 0);
  const spent = teams.reduce((sum, t) => sum + t.spent, 0);
  const row = income.rows[0];
  return {
    teams,
    totals: {
      budget_total: row.budget_total === null ? 0 : Number(row.budget_total),
      allocated,
      spent,
      verified: teams.reduce((sum, t) => sum + t.verified, 0),
      remaining: allocated - spent,
      sponsorship_committed: Number(row.sponsorship_committed),
      sponsorship_received: Number(row.sponsorship_received),
      ticket_revenue: Number(row.ticket_revenue),
    },
  };
}

/** Team allocated vs spent (non-rejected) — used to detect a budget overrun. */
export async function teamSpendVsAllocation(teamId: string): Promise<{ allocated: number; spent: number }> {
  const r = await query(
    `SELECT COALESCE((SELECT SUM(amount) FROM fund_allocations WHERE team_id = $1), 0) AS allocated,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE team_id = $1 AND status <> 'REJECTED'), 0) AS spent`,
    [teamId],
  );
  return { allocated: Number(r.rows[0].allocated), spent: Number(r.rows[0].spent) };
}

/** FR-FIN-06: alert when a team's logged spending goes past its allocation. */
export async function alertIfOverBudget(opts: {
  societyId: string;
  eventId: string;
  eventTitle: string;
  teamId: string;
  teamName: string;
  spentBefore: number;
}): Promise<boolean> {
  const { allocated, spent } = await teamSpendVsAllocation(opts.teamId);
  if (!(spent > allocated && opts.spentBefore <= allocated)) return false;
  const recipients = [
    ...(await teamMemberIds(opts.teamId, true)),
    ...(await usersInEventFunction(opts.eventId, FUNCTION.FINANCE)),
    ...(await usersWithSocietyPrivilege(opts.societyId, 'MANAGE_FINANCE')),
  ];
  await notifyUsers(recipients, {
    title: `Over budget: ${opts.teamName}`,
    body: `${opts.teamName} has logged Rs ${spent.toLocaleString()} against an allocation of Rs ${allocated.toLocaleString()} for "${opts.eventTitle}".`,
    link: `/society/${opts.societyId}/events/${opts.eventId}/workspace?tab=finance`,
    email: true,
  });
  return true;
}
