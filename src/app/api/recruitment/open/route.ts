export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { isUuid } from '@/lib/event-workspace';

/**
 * GET /api/recruitment/open?societyId=  — open recruitment forms students can apply to,
 * plus the caller's own applications (any status). FR-REC-02.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const societyId = req.nextUrl.searchParams.get('societyId');
    if (societyId && !isUuid(societyId)) return ApiErrors.validation('Invalid societyId');

    const [open, mine] = await Promise.all([
      query(
        `SELECT f.id, f.title, f.description, f.target_role, f.closes_at, f.society_id, s.name AS society_name,
                f.event_id, e.title AS event_title, p.name AS team_name,
                jsonb_array_length(f.questions) AS question_count
         FROM recruitment_forms f
         JOIN societies s ON s.id = f.society_id AND s.status = 'APPROVED' AND s.deleted_at IS NULL
         JOIN events e ON e.id = f.event_id AND e.deleted_at IS NULL AND e.archived_at IS NULL
         LEFT JOIN event_teams et ON et.id = f.team_id
         LEFT JOIN portfolios p ON p.id = et.portfolio_id
         WHERE f.status = 'OPEN' AND (f.closes_at IS NULL OR f.closes_at > NOW())
           AND ($1::uuid IS NULL OR f.society_id = $1)
         ORDER BY f.closes_at NULLS LAST, f.created_at DESC
         LIMIT 100`,
        [societyId],
      ),
      query(
        `SELECT a.id, a.status, a.submitted_at, a.updated_at, f.id AS form_id, f.title, f.target_role,
                s.name AS society_name, e.title AS event_title, p.name AS team_name,
                (SELECT MIN(i.scheduled_at) FROM recruitment_interviews i
                 WHERE i.application_id = a.id AND i.status = 'SCHEDULED' AND i.scheduled_at > NOW()) AS next_interview
         FROM recruitment_applications a
         JOIN recruitment_forms f ON f.id = a.form_id
         JOIN societies s ON s.id = f.society_id
         JOIN events e ON e.id = f.event_id
         LEFT JOIN event_teams et ON et.id = COALESCE(a.placed_team_id, f.team_id, a.preferred_team_id)
         LEFT JOIN portfolios p ON p.id = et.portfolio_id
         WHERE a.applicant_id = $1
         ORDER BY a.updated_at DESC`,
        [user.userId],
      ),
    ]);
    return NextResponse.json({ open: open.rows, mine: mine.rows });
  } catch (error) {
    return ApiErrors.serverError('Open recruitment error:', error);
  }
}
