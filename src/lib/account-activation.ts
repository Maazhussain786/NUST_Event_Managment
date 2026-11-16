import { query } from './db';

/**
 * Runs once an account becomes ACTIVE (email verified or Google sign-in).
 *
 * If a super admin approved a society naming this person as Faculty Sponsor
 * before they had an account, the Faculty Sponsor role is assigned now.
 */
export async function onAccountActivated(userId: string, email: string): Promise<void> {
  const pending = await query(
    `SELECT s.id AS society_id, r.id AS role_id, s.approved_by
     FROM societies s
     JOIN roles r ON r.society_id = s.id AND r.tier = 'FACULTY_SPONSOR'
     WHERE s.status = 'APPROVED' AND s.deleted_at IS NULL
       AND LOWER(s.faculty_sponsor_email) = LOWER($1)
       AND NOT EXISTS (
         SELECT 1 FROM society_memberships sm
         WHERE sm.society_id = s.id AND sm.role_id = r.id AND sm.is_active
       )`,
    [email],
  );

  for (const row of pending.rows) {
    // Remove any lower membership first: one active role per user per society scope.
    await query(
      `UPDATE society_memberships SET is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND society_id = $2 AND is_active AND wing_id IS NULL AND portfolio_id IS NULL`,
      [userId, row.society_id],
    );
    await query(
      `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [userId, row.society_id, row.role_id, row.approved_by],
    );
    await query(
      `UPDATE users SET designation = 'FACULTY' WHERE id = $1 AND designation = 'STUDENT'`,
      [userId],
    );
    await query(
      `INSERT INTO notifications (user_id, title, body, link)
       VALUES ($1, 'You are a Faculty Sponsor', 'You have been assigned as Faculty Sponsor of a society.', $2)`,
      [userId, `/society/${row.society_id}/dashboard`],
    );
  }
}
