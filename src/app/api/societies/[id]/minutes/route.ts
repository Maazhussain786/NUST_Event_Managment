export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { getSocietyAccess, can, forbidden } from '@/lib/rbac';
import { seesAllMinutes, OWN_MINUTES_CONDITION, validateMinutesContent, canCreateMinutes } from '@/lib/minutes';
import { isUuid } from '@/lib/event-workspace';

// GET /api/societies/[id]/minutes?status=&event_id= — minutes the caller may read
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getSocietyAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.isMember && !access.isSuperAdmin) return forbidden('You are not a member of this society.');

    const all = seesAllMinutes(access);
    const status = req.nextUrl.searchParams.get('status');
    const eventId = req.nextUrl.searchParams.get('event_id');
    const result = await query(
      `SELECT m.id, m.title, m.meeting_date, m.status, m.event_id, e.title AS event_title, m.team_id, p.name AS team_name,
              m.created_by, u.full_name AS author_name, m.submitted_at, m.locked_at, m.created_at, m.updated_at
       FROM minutes_sheets m
       JOIN users u ON u.id = m.created_by
       LEFT JOIN events e ON e.id = m.event_id
       LEFT JOIN event_teams et ON et.id = m.team_id
       LEFT JOIN portfolios p ON p.id = et.portfolio_id
       WHERE m.society_id = $2 AND m.deleted_at IS NULL
         AND (m.status <> 'DRAFT' OR m.created_by = $1)
         AND ($3::boolean OR ${OWN_MINUTES_CONDITION})
         AND ($4::text IS NULL OR m.status = $4)
         AND ($5::uuid IS NULL OR m.event_id = $5)
       ORDER BY m.meeting_date DESC, m.created_at DESC
       LIMIT 300`,
      [user.userId, params.id, all, status || null, isUuid(eventId) ? eventId : null],
    );
    return NextResponse.json({
      minutes: result.rows,
      can: {
        approve: can(access, 'APPROVE_MINUTES'),
        review: can(access, 'REVIEW_MINUTES'),
        create_society_level: can(access, 'CREATE_MINUTES'),
      },
    });
  } catch (error) {
    return ApiErrors.serverError('Minutes list error:', error);
  }
}

// POST /api/societies/[id]/minutes — create a draft (FR-MIN-01)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const body = await req.json().catch(() => ({}));
    const eventId = body.event_id ? String(body.event_id) : null;
    const teamId = body.team_id ? String(body.team_id) : null;
    if (teamId && !isUuid(teamId)) return ApiErrors.validation('Invalid team');

    const allowed = await canCreateMinutes(user, params.id, eventId, teamId);
    if (!allowed.ok) return allowed.error;
    const input = validateMinutesContent(body);
    if ('error' in input) return input.error;

    const inserted = await query(
      `INSERT INTO minutes_sheets (society_id, event_id, team_id, title, meeting_date, venue, attendees, agenda, decisions, action_items, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11) RETURNING id, status`,
      [params.id, eventId, teamId, input.title, input.meeting_date, input.venue, JSON.stringify(input.attendees),
        input.agenda, input.decisions, JSON.stringify(input.action_items), user.userId],
    );
    await writeAuditLog({
      action: 'MINUTES_CREATED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'minutes_sheet',
      targetId: inserted.rows[0].id,
      newValue: { title: input.title, event_id: eventId, team_id: teamId },
    });
    return NextResponse.json({ success: true, minutes: inserted.rows[0] }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Create minutes error:', error);
  }
}
