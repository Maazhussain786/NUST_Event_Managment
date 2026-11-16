export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// PATCH /api/admin/societies/[id] — approve/reject/suspend
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { action, reason } = await req.json();

    if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING', 'INFO_REQUESTED'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Get current status + creator for logging
    const current = await query(
      'SELECT status, created_by, president_name, faculty_sponsor_email FROM societies WHERE id = $1',
      [id]
    );
    if (current.rows.length === 0) {
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }

    const fromStatus = current.rows[0].status;
    const creatorId = current.rows[0].created_by;
    const facultySponsorEmail: string | null = current.rows[0].faculty_sponsor_email || null;

    // Use a transaction for APPROVED since we create roles + membership
    const client = await getClient();
    try {
      await client.query('BEGIN');

      if (action === 'REJECTED' && reason) {
        await client.query(
          'UPDATE societies SET status = $1, rejection_reason = $2, updated_at = NOW() WHERE id = $3',
          [action, reason, id]
        );
      } else if (action === 'INFO_REQUESTED') {
        await client.query(
          `UPDATE societies SET status = 'INFO_REQUESTED', admin_message = $1, updated_at = NOW() WHERE id = $2`,
          [reason || 'Additional information required.', id]
        );
      } else {
        await client.query(
          'UPDATE societies SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $3',
          [action, user.userId, id]
        );
      }

      // When APPROVING a PENDING society → create system roles + assign creator as President
      if (action === 'APPROVED' && fromStatus === 'PENDING') {
        // Default roles (role_templates) and the SRS portfolio catalog
        await client.query("SELECT fn_seed_society_roles($1)", [id]);
        await client.query("SELECT fn_seed_society_portfolios($1, $2)", [id, creatorId]);
        await client.query(
          "SELECT set_config('app.actor_id', $1, true), set_config('app.change_reason', 'Society approved', true), set_config('app.change_source', 'SYSTEM', true)",
          [user.userId]
        );

        // Founder becomes President
        if (creatorId) {
          await client.query(
            `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
             SELECT $1, $2, r.id, TRUE, $3 FROM roles r WHERE r.society_id = $2 AND r.name = 'President'
             ON CONFLICT DO NOTHING`,
            [creatorId, id, user.userId]
          );
        }

        // Nominated Faculty Sponsor: assign now if they have an active account,
        // otherwise it happens automatically when they verify their email.
        if (facultySponsorEmail) {
          const sponsor = await client.query(
            "SELECT id FROM users WHERE email = $1 AND status = 'ACTIVE'",
            [facultySponsorEmail]
          );
          if (sponsor.rows.length > 0 && sponsor.rows[0].id !== creatorId) {
            await client.query(
              `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
               SELECT $1, $2, r.id, TRUE, $3 FROM roles r WHERE r.society_id = $2 AND r.tier = 'FACULTY_SPONSOR'
               ON CONFLICT DO NOTHING`,
              [sponsor.rows[0].id, id, user.userId]
            );
            await client.query("UPDATE users SET designation = 'FACULTY' WHERE id = $1 AND designation = 'STUDENT'", [sponsor.rows[0].id]);
            await client.query(
              "INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)",
              [sponsor.rows[0].id, "You are a Faculty Sponsor", "You have been assigned as Faculty Sponsor of a newly approved society.", `/society/${id}/dashboard`]
            );
          }
        }

        // Create default society_settings
        await client.query(
          `INSERT INTO society_settings (society_id) VALUES ($1) ON CONFLICT (society_id) DO NOTHING`,
          [id]
        );

        // Notify creator
        await client.query(
          `INSERT INTO notifications (user_id, title, body, link)
           VALUES ($1, $2, $3, $4)`,
          [
            creatorId,
            'Society Approved! 🎉',
            'Your society has been approved. You are now the President.',
            `/society/${id}/dashboard`,
          ]
        );
      }

      if (action === 'REJECTED') {
        // Notify creator
        await client.query(
          `INSERT INTO notifications (user_id, title, body, link)
           VALUES ($1, $2, $3, $4)`,
          [
            creatorId,
            'Society Application Rejected',
            reason || 'Your society application was not approved.',
            '/societies',
          ]
        );
      }

      if (action === 'INFO_REQUESTED') {
        // Notify creator that more info is needed
        await client.query(
          `INSERT INTO notifications (user_id, title, body, link)
           VALUES ($1, $2, $3, $4)`,
          [
            creatorId,
            'More Information Requested',
            reason || 'The admin has requested additional information for your society application.',
            '/register-society',
          ]
        );
      }

      // Log state change
      await client.query(
        `INSERT INTO society_state_changes (society_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, fromStatus, action, user.userId, reason || '']
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, status: action });
  } catch (error) {
    console.error('Admin society action error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
