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
    // Note: Using separate queries and combining in JS is more resilient to schema variations
    let participants: Array<{
      id: string;
      user_id: string;
      event_id: string;
      full_name: string;
      email: string;
      avatar_url: string | null;
      event_title: string;
      type: string;
      status: string;
      checked_in: boolean;
      registered_at: string;
    }> = [];

    // Get free event registrations
    try {
      const regSql = `
        SELECT
          er.id, er.user_id, er.event_id,
          u.full_name, u.email, u.avatar_url,
          e.title AS event_title,
          'REGISTRATION' AS type,
          CASE WHEN er.cancelled_at IS NOT NULL THEN 'CANCELLED' ELSE 'ACTIVE' END AS status,
          FALSE AS checked_in,
          er.registered_at
        FROM event_registrations er
        JOIN users u ON er.user_id = u.id
        JOIN events e ON er.event_id = e.id
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
          u.full_name, u.email, u.avatar_url,
          e.title AS event_title,
          'TICKET' AS type,
          t.status::TEXT AS status,
          FALSE AS checked_in,
          t.purchased_at AS registered_at
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        JOIN events e ON t.event_id = e.id
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
