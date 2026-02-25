/**
 * GET /api/admin/users/[id] — detailed user profile with memberships, events, audit
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const [userResult, memberships, events, auditLogs] = await Promise.all([
      query(
        `SELECT id, email, full_name, user_type, status, avatar_url, created_at
         FROM users WHERE id = $1`,
        [id]
      ),
      query(
        `SELECT sm.society_id, s.name AS society_name, sm.role, sm.is_active, sm.joined_at
         FROM society_memberships sm
         JOIN societies s ON s.id = sm.society_id
         WHERE sm.user_id = $1
         ORDER BY sm.joined_at DESC`,
        [id]
      ),
      query(
        `SELECT er.event_id, e.title AS event_title, s.name AS society_name,
                er.registered_at, er.status
         FROM event_registrations er
         JOIN events e ON e.id = er.event_id
         JOIN societies s ON s.id = e.society_id
         WHERE er.user_id = $1
         ORDER BY er.registered_at DESC
         LIMIT 20`,
        [id]
      ),
      query(
        `SELECT al.id, al.action, al.performed_by,
                u.full_name AS performed_by_name,
                u.email AS performed_by_email,
                al.society_id, s.name AS society_name,
                al.target_type, al.target_id,
                al.old_value, al.new_value, al.metadata,
                al.ip_address, al.created_at
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.performed_by
         LEFT JOIN societies s ON s.id = al.society_id
         WHERE al.performed_by = $1
         ORDER BY al.created_at DESC
         LIMIT 30`,
        [id]
      ),
    ]);

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...userResult.rows[0],
      memberships: memberships.rows,
      events: events.rows,
      auditLogs: auditLogs.rows,
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch user detail' }, { status: 500 });
  }
}
