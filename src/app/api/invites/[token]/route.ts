import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/invites/[token] — get invite details (public, for accept page)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

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
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please sign in to accept this invite' }, { status: 401 });

    const { token } = await params;

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

      // Get the role id
      const roleResult = await client.query(
        `SELECT id FROM roles WHERE society_id = $1 AND name = $2`,
        [invite.society_id, invite.role_name]
      );
      if (roleResult.rows.length === 0) {
        throw new Error(`Role "${invite.role_name}" not found for this society`);
      }

      // Deactivate any existing membership for this user in this society with same scope
      await client.query(
        `UPDATE society_memberships SET is_active = FALSE, updated_at = NOW()
         WHERE user_id = $1 AND society_id = $2
           AND COALESCE(wing_id::text, '') = COALESCE($3::text, '')
           AND COALESCE(portfolio_id::text, '') = COALESCE($4::text, '')`,
        [user.userId, invite.society_id, invite.wing_id, invite.portfolio_id]
      );

      // Create new membership
      await client.query(
        `INSERT INTO society_memberships (user_id, society_id, role_id, wing_id, portfolio_id, is_active, assigned_by)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
        [user.userId, invite.society_id, roleResult.rows[0].id, invite.wing_id, invite.portfolio_id, invite.invited_by]
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
          `/society-dashboard/${invite.society_id}`,
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
    console.error('Invite accept error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to accept invite';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
