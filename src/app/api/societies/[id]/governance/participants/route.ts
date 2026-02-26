export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/participants — list participants across society events
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Verify membership or super admin
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    // Build unified query: registrations + ticket holders
    let sql = `
      SELECT DISTINCT ON (combined.user_id, combined.event_id)
        combined.*
      FROM (
        -- Free event registrations
        SELECT
          er.id, er.user_id, er.event_id,
          u.full_name, u.email, u.avatar_url,
          e.title AS event_title,
          'REGISTRATION' AS type,
          CASE WHEN er.cancelled_at IS NOT NULL THEN 'CANCELLED' ELSE 'ACTIVE' END AS status,
          CASE WHEN ea.id IS NOT NULL THEN TRUE ELSE FALSE END AS checked_in,
          er.registered_at
        FROM event_registrations er
        JOIN users u ON er.user_id = u.id
        JOIN events e ON er.event_id = e.id
        LEFT JOIN event_attendance ea ON ea.event_id = er.event_id AND ea.user_id = er.user_id
        WHERE e.society_id = $1
        ${eventId ? 'AND er.event_id = $2' : ''}

        UNION ALL

        -- Paid event ticket holders
        SELECT
          t.id, t.user_id, t.event_id,
          u.full_name, u.email, u.avatar_url,
          e.title AS event_title,
          'TICKET' AS type,
          t.status::TEXT AS status,
          CASE WHEN ea.id IS NOT NULL THEN TRUE ELSE FALSE END AS checked_in,
          t.purchased_at AS registered_at
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        JOIN events e ON t.event_id = e.id
        LEFT JOIN event_attendance ea ON ea.event_id = t.event_id AND ea.user_id = t.user_id
        WHERE e.society_id = $1
        ${eventId ? 'AND t.event_id = $2' : ''}
      ) combined
      ORDER BY combined.user_id, combined.event_id, combined.registered_at DESC
    `;

    const qParams: unknown[] = [societyId];
    if (eventId) qParams.push(eventId);

    const result = await query(sql, qParams);

    // Count
    const total = result.rows.length;

    return NextResponse.json({
      participants: result.rows,
      total,
    });
  } catch (error) {
    console.error('Participants error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
