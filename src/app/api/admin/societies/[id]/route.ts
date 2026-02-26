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

    if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Get current status + creator for logging
    const current = await query(
      'SELECT status, created_by, president_name FROM societies WHERE id = $1',
      [id]
    );
    if (current.rows.length === 0) {
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }

    const fromStatus = current.rows[0].status;
    const creatorId = current.rows[0].created_by;

    // Use a transaction for APPROVED since we create roles + membership
    const client = await getClient();
    try {
      await client.query('BEGIN');

      if (action === 'REJECTED' && reason) {
        await client.query(
          'UPDATE societies SET status = $1, rejection_reason = $2, updated_at = NOW() WHERE id = $3',
          [action, reason, id]
        );
      } else {
        await client.query(
          'UPDATE societies SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $3',
          [action, user.userId, id]
        );
      }

      // When APPROVING a PENDING society → create system roles + assign creator as President
      if (action === 'APPROVED' && fromStatus === 'PENDING') {
        // Create all 5 system roles
        const roleNames = [
          { name: 'President', desc: 'Society President — full control', level: 10 },
          { name: 'Vice President', desc: 'Wing VP', level: 8 },
          { name: 'Director', desc: 'Portfolio Director', level: 5 },
          { name: 'Deputy Director', desc: 'Deputy Portfolio Director', level: 3 },
          { name: 'Member', desc: 'General member', level: 1 },
        ];

        for (const r of roleNames) {
          await client.query(
            `INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role)
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT (society_id, name) DO NOTHING`,
            [id, r.name, r.desc, r.level]
          );
        }

        // Assign all privileges to President role
        await client.query(
          `INSERT INTO role_privileges (role_id, privilege_id)
           SELECT r.id, p.id FROM roles r CROSS JOIN privileges p
           WHERE r.society_id = $1 AND r.name = 'President'
           ON CONFLICT DO NOTHING`,
          [id]
        );

        // Assign VP privileges
        await client.query(
          `INSERT INTO role_privileges (role_id, privilege_id)
           SELECT r.id, p.id FROM roles r CROSS JOIN privileges p
           WHERE r.society_id = $1 AND r.name = 'Vice President'
             AND p.name IN ('CREATE_EVENT','EDIT_EVENT','CANCEL_EVENT','UPLOAD_CONTENT',
               'DELETE_CONTENT','SEND_MESSAGE','VIEW_CHAT','MANAGE_CHAT',
               'MANAGE_MEMBERS','MANAGE_PORTFOLIOS','SCAN_QR','VIEW_ANALYTICS')
           ON CONFLICT DO NOTHING`,
          [id]
        );

        // Get President role id for this society
        const presRole = await client.query(
          `SELECT id FROM roles WHERE society_id = $1 AND name = 'President'`,
          [id]
        );

        if (presRole.rows.length > 0 && creatorId) {
          // Assign creator as President
          await client.query(
            `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
             VALUES ($1, $2, $3, TRUE, $4)
             ON CONFLICT DO NOTHING`,
            [creatorId, id, presRole.rows[0].id, user.userId]
          );
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
            `/society-dashboard/${id}`,
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
