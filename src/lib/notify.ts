import { query } from './db';
import { sendEmail, emailTemplates } from './email';
import { sendPushNotifications } from './push-notifications';

/**
 * One call for user notifications (FR-LOGS-04: in-app and email notifications
 * for approvals, assignments and deadlines; FR-DUTY-05; FR-AUTH-05).
 *
 * Always writes the in-app notification. Email and push are best-effort and
 * never make the calling request fail.
 */
export interface NotifyInput {
  title: string;
  body: string;
  link?: string | null;
  /** Also send an email (approvals, assignments, deadlines). */
  email?: boolean;
  /** Also send a push notification to the user's devices. Default true. */
  push?: boolean;
}

export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  await notifyUsers([userId], input);
}

export async function notifyUsers(userIds: string[], input: NotifyInput): Promise<void> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return;

  try {
    await query(
      `INSERT INTO notifications (user_id, title, body, link)
       SELECT UNNEST($1::uuid[]), $2, $3, $4`,
      [ids, input.title.slice(0, 300), input.body, input.link ?? null],
    );
  } catch (error) {
    console.error('[notify] in-app notification failed:', (error as Error).message);
    return;
  }

  if (input.push !== false) {
    sendPushNotifications(
      ids.map((userId) => ({ userId, title: input.title, body: input.body, link: input.link ?? null })),
    ).catch((error) => console.warn('[notify] push failed:', (error as Error).message));
  }

  if (input.email) {
    try {
      const recipients = await query(
        `SELECT email, full_name FROM users WHERE id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
        [ids],
      );
      await Promise.all(
        recipients.rows.map((r: { email: string; full_name: string }) =>
          sendEmail({ to: r.email, ...emailTemplates.notification(r.full_name, input.title, input.body, input.link) }),
        ),
      );
    } catch (error) {
      console.warn('[notify] email failed:', (error as Error).message);
    }
  }
}

/** Users in a society holding a privilege (Admins/Faculty Sponsor always included). */
export async function usersWithSocietyPrivilege(societyId: string, privilege: string): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT sm.user_id
     FROM society_memberships sm
     WHERE sm.society_id = $1 AND sm.is_active AND sm.suspended_at IS NULL
       AND fn_has_privilege(sm.user_id, $1, $2)`,
    [societyId, privilege],
  );
  return result.rows.map((r: { user_id: string }) => r.user_id);
}

/** Members of an event's teams with a given portfolio function (e.g. FINANCE, LOGISTICS). */
export async function usersInEventFunction(eventId: string, functionKey: string, leadsOnly = false): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT etm.user_id
     FROM event_team_members etm
     JOIN event_teams et ON et.id = etm.team_id AND et.is_active
     JOIN portfolios p ON p.id = et.portfolio_id
     WHERE etm.event_id = $1 AND etm.removed_at IS NULL AND p.function_key = $2
       AND ($3::boolean = FALSE OR etm.team_role = 'TEAM_LEAD')`,
    [eventId, functionKey, leadsOnly],
  );
  return result.rows.map((r: { user_id: string }) => r.user_id);
}

/** Active members of one event team. */
export async function teamMemberIds(teamId: string, leadsOnly = false): Promise<string[]> {
  const result = await query(
    `SELECT user_id FROM event_team_members
     WHERE team_id = $1 AND removed_at IS NULL AND ($2::boolean = FALSE OR team_role = 'TEAM_LEAD')`,
    [teamId, leadsOnly],
  );
  return result.rows.map((r: { user_id: string }) => r.user_id);
}
