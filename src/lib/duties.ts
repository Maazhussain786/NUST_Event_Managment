import type { NextResponse } from 'next/server';
import { query } from './db';
import { ApiErrors } from './api-utils';
import { cleanText, isUuid, loadTeam, parseTimestamp } from './event-workspace';

export interface DutyInput {
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  assignee_id: string;
  team_id: string | null;
}

/** Shared validation for creating/editing a duty. The assignee must work on the event. */
export async function validateDuty(eventId: string, body: Record<string, unknown>): Promise<DutyInput | { error: NextResponse }> {
  const title = cleanText(body.title, 300);
  if (!title) return { error: ApiErrors.validation('Title is required') };
  if (!isUuid(body.assignee_id)) return { error: ApiErrors.validation('Choose who the duty is for') };
  const startsAt = body.starts_at ? parseTimestamp(body.starts_at) : null;
  const endsAt = body.ends_at ? parseTimestamp(body.ends_at) : null;
  if ((body.starts_at && !startsAt) || (body.ends_at && !endsAt)) return { error: ApiErrors.validation('Invalid date/time') };
  if (startsAt && endsAt && endsAt <= startsAt) return { error: ApiErrors.validation('End must be after start') };

  let teamId: string | null = null;
  if (body.team_id) {
    const team = await loadTeam(eventId, String(body.team_id));
    if (!team || !team.is_active) return { error: ApiErrors.validation('That team is not active for this event') };
    teamId = team.id;
  }

  const assignee = await query(
    `SELECT 1 FROM users u WHERE u.id = $1 AND u.status = 'ACTIVE' AND (
       EXISTS (SELECT 1 FROM event_team_members etm WHERE etm.event_id = $2 AND etm.user_id = u.id AND etm.removed_at IS NULL
               AND ($3::uuid IS NULL OR etm.team_id = $3))
       OR EXISTS (SELECT 1 FROM events e WHERE e.id = $2 AND e.event_head_id = u.id AND $3::uuid IS NULL))`,
    [body.assignee_id, eventId, teamId],
  );
  if (assignee.rows.length === 0) {
    return { error: ApiErrors.validation(teamId ? 'The assignee must be a member of that team' : 'The assignee must be on this event') };
  }

  return {
    title,
    description: cleanText(body.description, 4000),
    location: cleanText(body.location, 300),
    starts_at: startsAt,
    ends_at: endsAt,
    assignee_id: String(body.assignee_id),
    team_id: teamId,
  };
}
