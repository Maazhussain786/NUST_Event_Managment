export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

class InviteError extends Error {}

// GET /api/invites/[token] — get invite details (public, for accept page)
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    const result = await query(
      `SELECT it.id, it.role_name, it.invited_email, it.status, it.expires_at,
              it.society_id, it.wing_id, it.portfolio_id,
              s.name AS society_name, s.description AS society_description,
              w.name AS wing_name, p.name AS portfolio_name,
              u.full_name AS invited_by_name
       FROM invite_tokens it
       JOIN societies s ON it.society_id = s.id
       JOIN users u ON it.invited_by = u.id
       LEFT JOIN wings w ON it.wing_id = w.id
       LEFT JOIN portfolios p ON it.portfolio_id = p.id
       WHERE it.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
    }

    const invite = result.rows[0];

    // Check expiry
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite has expired', invite: { ...invite, status: 'EXPIRED' } }, { status: 410 });
    }

    if (invite.status !== 'PENDING') {
      return NextResponse.json({ error: `Invite already ${invite.status.toLowerCase()}`, invite }, { status: 410 });
    }

    return NextResponse.json(invite);
  } catch (error) {
    console.error('Invite fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/invites/[token] — accept invite
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please sign in to accept this invite' }, { status: 401 });

    const { token } = params;

    // Fetch invite
    const inviteResult = await query(
      `SELECT * FROM invite_tokens WHERE token = $1`,
      [token]
    );
    if (inviteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
    }

    const invite = inviteResult.rows[0];

    if (invite.status !== 'PENDING') {
      return NextResponse.json({ error: `Invite already ${invite.status.toLowerCase()}` }, { status: 410 });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await query(`UPDATE invite_tokens SET status = 'EXPIRED' WHERE id = $1`, [invite.id]);
      return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
    }

    // Check email matches (case-insensitive)
    if (invite.invited_email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: `This invite was sent to ${invite.invited_email}. Please sign in with that email.` },
        { status: 403 }
      );
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get the role (by name, as stored on the invite)
      const roleResult = await client.query(
        `SELECT id, name, tier, max_holders FROM roles WHERE society_id = $1 AND name = $2`,
        [invite.society_id, invite.role_name]
      );
      if (roleResult.rows.length === 0) {
        throw new InviteError(`The role "${invite.role_name}" no longer exists in this society. Ask for a new invite.`);
      }
      const role = roleResult.rows[0];
      const roleName = role.name as string;
      if (roleName === 'President' || role.tier === 'FACULTY_SPONSOR') {
        throw new InviteError('This role cannot be accepted through an invite.');
      }
      if (invite.portfolio_id) {
        throw new InviteError('This is an old portfolio invite. Team places are now given per event; ask for a new invite.');
      }
      if (invite.wing_id) {
        const wingCheck = await client.query(
          `SELECT id FROM wings WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL`,
          [invite.wing_id, invite.society_id]
        );
        if (wingCheck.rows.length === 0) throw new InviteError('The wing for this invite no longer exists.');
      }
      if (role.max_holders) {
        const holders = await client.query(
          `SELECT COUNT(*)::int AS c FROM society_memberships WHERE society_id = $1 AND role_id = $2 AND is_active AND user_id <> $3`,
          [invite.society_id, role.id, user.userId]
        );
        if (holders.rows[0].c >= role.max_holders) throw new InviteError(`${roleName} is already filled.`);
      }
      const suspended = await client.query(
        `SELECT 1 FROM society_memberships WHERE user_id = $1 AND society_id = $2 AND suspended_at IS NOT NULL AND NOT is_active`,
        [user.userId, invite.society_id]
      );
      if (suspended.rows.length > 0) throw new InviteError('You are suspended from this society.');

      await client.query(
        "SELECT set_config('app.actor_id', $1, true), set_config('app.change_reason', 'Accepted invitation', true), set_config('app.change_source', 'DIRECT', true)",
        [invite.invited_by]
      );

      // Replace any existing society-wide membership
      await client.query(
        `UPDATE society_memberships SET is_active = FALSE, updated_at = NOW()
         WHERE user_id = $1 AND society_id = $2 AND is_active AND portfolio_id IS NULL`,
        [user.userId, invite.society_id]
      );

      // Create new membership
      const createdMembership = await client.query(
        `INSERT INTO society_memberships (user_id, society_id, role_id, wing_id, portfolio_id, is_active, assigned_by)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6)
         RETURNING id`,
        [user.userId, invite.society_id, role.id, invite.wing_id, null, invite.invited_by]
      );

      await client.query(
        `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'ROLE_ASSIGNED',
          invite.invited_by,
          invite.society_id,
          'society_membership',
          createdMembership.rows[0].id,
          JSON.stringify({
            role: roleName,
            wing_id: invite.wing_id,
            portfolio_id: invite.portfolio_id,
          }),
          JSON.stringify({
            invited_email: invite.invited_email,
            accepted_by: user.userId,
            accepted_at: new Date().toISOString(),
            source: 'invite_acceptance',
          }),
        ]
      );

      // Mark invite as accepted
      await client.query(
        `UPDATE invite_tokens SET status = 'ACCEPTED', accepted_by = $1, accepted_at = NOW() WHERE id = $2`,
        [user.userId, invite.id]
      );

      // Notify inviter
      await client.query(
        `INSERT INTO notifications (user_id, title, body, link)
         VALUES ($1, $2, $3, $4)`,
        [
          invite.invited_by,
          'Invite Accepted',
          `${user.fullName} accepted the ${invite.role_name} invite`,
          `/society/${invite.society_id}/dashboard`,
        ]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return NextResponse.json({
      success: true,
      societyId: invite.society_id,
      roleName: invite.role_name,
    });
  } catch (error) {
    if (error instanceof InviteError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Invite accept error:', error);
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
  }
}
