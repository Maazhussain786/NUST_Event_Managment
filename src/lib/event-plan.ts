import type { NextResponse } from 'next/server';
import { query } from './db';
import { ApiErrors } from './api-utils';
import type { EventAccess } from './rbac';
import { cleanText, isUuid, parseDateOnly, parseTime } from './event-workspace';
import { notifyUsers } from './notify';

export interface PlanInput {
  day_date: string;
  start_time: string;
  end_time: string;
  title: string;
  venue: string | null;
  description: string | null;
  team_id: string | null;
}

/** Validates a plan item body. The day must fall within the event's dates (Pakistan time). */
export async function validatePlanInput(
  eventId: string,
  body: Record<string, unknown>,
): Promise<PlanInput | { error: NextResponse }> {
  const day = parseDateOnly(body.day_date);
  const start = parseTime(body.start_time);
  const end = parseTime(body.end_time);
  const title = cleanText(body.title, 300);
  if (!day) return { error: ApiErrors.validation('day_date must be YYYY-MM-DD') };
  if (!start || !end) return { error: ApiErrors.validation('start_time and end_time must be HH:MM') };
  if (end <= start) return { error: ApiErrors.validation('End time must be after start time') };
  if (!title) return { error: ApiErrors.validation('Title is required') };

  const window = await query(
    `SELECT (event_start AT TIME ZONE 'Asia/Karachi')::date AS first_day,
            (event_end AT TIME ZONE 'Asia/Karachi')::date AS last_day
     FROM events WHERE id = $1`,
    [eventId],
  );
  const { first_day: firstDay, last_day: lastDay } = window.rows[0] ?? {};
  const toDate = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  if (firstDay && (day < toDate(firstDay) || day > toDate(lastDay))) {
    return { error: ApiErrors.validation(`The day must be between ${toDate(firstDay)} and ${toDate(lastDay)} (the event dates)`) };
  }

  let teamId: string | null = null;
  if (body.team_id) {
    if (!isUuid(body.team_id)) return { error: ApiErrors.validation('Invalid team') };
    const team = await query('SELECT 1 FROM event_teams WHERE id = $1 AND event_id = $2 AND is_active', [body.team_id, eventId]);
    if (team.rows.length === 0) return { error: ApiErrors.validation('That team is not active for this event') };
    teamId = body.team_id;
  }

  return {
    day_date: day,
    start_time: start,
    end_time: end,
    title,
    venue: cleanText(body.venue, 300),
    description: cleanText(body.description, 4000),
    team_id: teamId,
  };
}

/** Tells everyone working on the event (in-app only) that the plan changed (FR-EVT-05). */
export async function notifyPlanChange(access: EventAccess, actorId: string, summary: string): Promise<void> {
  const people = await query(
    `SELECT DISTINCT user_id FROM event_team_members WHERE event_id = $1 AND removed_at IS NULL
     UNION SELECT event_head_id FROM events WHERE id = $1 AND event_head_id IS NOT NULL`,
    [access.event.id],
  );
  const ids = people.rows.map((r: { user_id: string }) => r.user_id).filter((id: string) => id && id !== actorId);
  await notifyUsers(ids, {
    title: `Plan updated: ${access.event.title}`,
    body: summary,
    link: `/society/${access.event.society_id}/events/${access.event.id}/workspace?tab=plan`,
    push: false,
  });
}
