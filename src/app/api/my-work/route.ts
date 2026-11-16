export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';

/**
 * GET /api/my-work — the personal dashboard (SRS 3.4 Executive interface):
 * my duties across events, my teams, events I head, and team duties I can see.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const [duties, teams, headed, teamDuties] = await Promise.all([
      query(
        `SELECT d.id, d.title, d.description, d.location, d.starts_at, d.ends_at, d.status, d.event_id, d.society_id,
                e.title AS event_title, s.name AS society_name, p.name AS team_name, bu.full_name AS assigned_by_name
         FROM duties d
         JOIN events e ON e.id = d.event_id AND e.deleted_at IS NULL
         JOIN societies s ON s.id = d.society_id
         JOIN users bu ON bu.id = d.assigned_by
         LEFT JOIN event_teams et ON et.id = d.team_id
         LEFT JOIN portfolios p ON p.id = et.portfolio_id
         WHERE d.assignee_id = $1 AND d.deleted_at IS NULL
         ORDER BY (d.status = 'DONE'), d.starts_at NULLS LAST, d.created_at DESC
         LIMIT 200`,
        [user.userId],
      ),
      query(
        `SELECT etm.team_id, etm.team_role, et.event_id, e.title AS event_title, e.event_start, e.event_end,
                e.society_id, s.name AS society_name, p.name AS team_name, p.function_key,
                (SELECT json_agg(json_build_object('name', u.full_name, 'role', m.team_role, 'email', u.email)
                                 ORDER BY m.team_role DESC, u.full_name)
                 FROM event_team_members m JOIN users u ON u.id = m.user_id
                 WHERE m.team_id = etm.team_id AND m.removed_at IS NULL) AS members
         FROM event_team_members etm
         JOIN event_teams et ON et.id = etm.team_id AND et.is_active
         JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL AND e.archived_at IS NULL
         JOIN societies s ON s.id = e.society_id
         JOIN portfolios p ON p.id = et.portfolio_id
         JOIN society_memberships sm ON sm.society_id = e.society_id AND sm.user_id = etm.user_id AND sm.is_active
         WHERE etm.user_id = $1 AND etm.removed_at IS NULL
         ORDER BY e.event_start`,
        [user.userId],
      ),
      query(
        `SELECT e.id, e.title, e.event_start, e.event_end, e.society_id, s.name AS society_name
         FROM events e JOIN societies s ON s.id = e.society_id
         WHERE e.event_head_id = $1 AND e.deleted_at IS NULL AND e.archived_at IS NULL
         ORDER BY e.event_start`,
        [user.userId],
      ),
      query(
        `SELECT d.id, d.team_id, d.title, d.starts_at, d.status, au.full_name AS assignee_name
         FROM duties d
         JOIN users au ON au.id = d.assignee_id
         WHERE d.deleted_at IS NULL AND d.team_id IN (
           SELECT team_id FROM event_team_members WHERE user_id = $1 AND removed_at IS NULL)
         ORDER BY d.starts_at NULLS LAST
         LIMIT 500`,
        [user.userId],
      ),
    ]);

    return NextResponse.json({
      duties: duties.rows,
      teams: teams.rows.map((t) => ({ ...t, duties: teamDuties.rows.filter((d) => d.team_id === t.team_id) })),
      event_head_of: headed.rows,
    });
  } catch (error) {
    return ApiErrors.serverError('My work error:', error);
  }
}
