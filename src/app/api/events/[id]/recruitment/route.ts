export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable } from '@/lib/rbac';
import { validateQuestions } from '@/lib/recruitment';
import { cleanText, isUuid, loadTeam, parseTimestamp } from '@/lib/event-workspace';

// GET /api/events/[id]/recruitment — recruitment forms of this event the caller may see
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;

    const seeAll = rules.viewAllRecruitment(access);
    const ledTeams = access.teams.filter((t) => t.teamRole === 'TEAM_LEAD').map((t) => t.teamId);
    const result = await query(
      `SELECT f.id, f.team_id, p.name AS team_name, f.target_role, f.title, f.description, f.status,
              f.closes_at, f.created_at, u.full_name AS created_by_name,
              COUNT(a.id)::int AS application_count,
              COUNT(a.id) FILTER (WHERE a.status = 'SHORTLISTED' OR a.status = 'INTERVIEW_SCHEDULED' OR a.status = 'INTERVIEWED')::int AS in_progress_count,
              COUNT(a.id) FILTER (WHERE a.status = 'SELECTED')::int AS selected_count
       FROM recruitment_forms f
       LEFT JOIN event_teams et ON et.id = f.team_id
       LEFT JOIN portfolios p ON p.id = et.portfolio_id
       LEFT JOIN users u ON u.id = f.created_by
       LEFT JOIN recruitment_applications a ON a.form_id = f.id AND a.status <> 'WITHDRAWN'
       WHERE f.event_id = $1 AND ($2::boolean OR f.team_id = ANY($3::uuid[]))
       GROUP BY f.id, p.name, u.full_name
       ORDER BY f.created_at DESC`,
      [params.id, seeAll, ledTeams],
    );
    return NextResponse.json({ forms: result.rows });
  } catch (error) {
    return ApiErrors.serverError('Recruitment list error:', error);
  }
}

/**
 * POST /api/events/[id]/recruitment — create a recruitment form (FR-REC-01, FR-REC-07)
 * { target_role: 'EXECUTIVE' | 'TEAM_LEAD', team_id?, title, description?, questions[], closes_at? }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const targetRole = String(body.target_role || 'EXECUTIVE').toUpperCase();
    if (targetRole !== 'EXECUTIVE' && targetRole !== 'TEAM_LEAD') return ApiErrors.validation('Invalid target role');

    let teamId: string | null = null;
    if (body.team_id) {
      if (!isUuid(body.team_id)) return ApiErrors.validation('Invalid team');
      const team = await loadTeam(params.id, body.team_id);
      if (!team || !team.is_active) return ApiErrors.validation('That team is not active for this event');
      teamId = team.id;
    }
    if (targetRole === 'EXECUTIVE' && !teamId) return ApiErrors.validation('Choose the team you are recruiting for');

    const allowed = targetRole === 'TEAM_LEAD'
      ? rules.manageRecruitmentFor(access, null)
      : rules.manageRecruitmentFor(access, teamId);
    if (!allowed) {
      return forbidden(targetRole === 'TEAM_LEAD'
        ? 'Only Admins can run Team Lead recruitment.'
        : 'Only this team\'s Team Lead or an Admin can recruit for it.');
    }

    const title = cleanText(body.title, 300);
    if (!title) return ApiErrors.validation('Title is required');
    const questions = validateQuestions(body.questions ?? []);
    if (typeof questions === 'string') return ApiErrors.validation(questions);
    const closesAt = body.closes_at ? parseTimestamp(body.closes_at) : null;
    if (body.closes_at && !closesAt) return ApiErrors.validation('Invalid closing date');

    const inserted = await query(
      `INSERT INTO recruitment_forms (society_id, event_id, team_id, target_role, title, description, questions, closes_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       RETURNING id, status`,
      [access.event.society_id, params.id, teamId, targetRole, title, cleanText(body.description, 4000),
        JSON.stringify(questions), closesAt, user.userId],
    );
    await writeAuditLog({
      action: 'RECRUITMENT_FORM_CREATED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'recruitment_form',
      targetId: inserted.rows[0].id,
      newValue: { title, targetRole, teamId, questions: questions.length },
    });
    return NextResponse.json({ success: true, form: inserted.rows[0] }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Create recruitment form error:', error);
  }
}
