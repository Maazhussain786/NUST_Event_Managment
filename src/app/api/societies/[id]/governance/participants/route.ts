export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/participants — list participants across society events
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = await params;

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
    // Keep field names aligned with src/app/society/types.ts (EventParticipant).
    let participants: Array<{
      id: string;
      user_id: string;
      event_id: string;
      user_name: string;
      user_email: string;
      user_avatar: string | null;
      event_title: string;
      registration_type: 'REGISTRATION' | 'TICKET';
      status: string;
      checked_in: boolean;
      check_in_time: string | null;
      registered_at: string;
    }> = [];

    // Get free event registrations
    try {
      const regSql = `
        SELECT
          er.id, er.user_id, er.event_id,
          u.full_name AS user_name,
          u.email AS user_email,
          u.avatar_url AS user_avatar,
          e.title AS event_title,
          'REGISTRATION' AS registration_type,
          CASE WHEN er.cancelled_at IS NOT NULL THEN 'CANCELLED' ELSE 'APPROVED' END AS status,
          (ea.id IS NOT NULL) AS checked_in,
          ea.checked_in_at AS check_in_time,
          er.registered_at
        FROM event_registrations er
        JOIN users u ON er.user_id = u.id
        JOIN events e ON er.event_id = e.id
        LEFT JOIN event_attendance ea ON ea.registration_id = er.id
        WHERE e.society_id = $1
        ${eventId ? 'AND er.event_id = $2' : ''}
        ORDER BY er.registered_at DESC
      `;
      const regParams: unknown[] = [societyId];
      if (eventId) regParams.push(eventId);
      const regResult = await query(regSql, regParams);
      participants = [...participants, ...regResult.rows];
    } catch (regErr) {
      console.error('Error fetching registrations:', regErr);
    }

    // Get paid event tickets
    try {
      const ticketSql = `
        SELECT
          t.id, t.user_id, t.event_id,
          u.full_name AS user_name,
          u.email AS user_email,
          u.avatar_url AS user_avatar,
          e.title AS event_title,
          'TICKET' AS registration_type,
          t.status::TEXT AS status,
          (ea.id IS NOT NULL OR t.checked_in_at IS NOT NULL) AS checked_in,
          COALESCE(ea.checked_in_at, t.checked_in_at) AS check_in_time,
          t.purchased_at AS registered_at
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        JOIN events e ON t.event_id = e.id
        LEFT JOIN event_attendance ea ON ea.ticket_id = t.id
        WHERE e.society_id = $1
        ${eventId ? 'AND t.event_id = $2' : ''}
        ORDER BY t.purchased_at DESC
      `;
      const ticketParams: unknown[] = [societyId];
      if (eventId) ticketParams.push(eventId);
      const ticketResult = await query(ticketSql, ticketParams);
      participants = [...participants, ...ticketResult.rows];
    } catch (ticketErr) {
      console.error('Error fetching tickets:', ticketErr);
    }

    // Sort combined results by registered_at descending
    participants.sort((a, b) =>
      new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime()
    );

    // Count
    const total = participants.length;

    return NextResponse.json({
      participants,
      total,
    });
  } catch (error) {
    console.error('Participants error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
