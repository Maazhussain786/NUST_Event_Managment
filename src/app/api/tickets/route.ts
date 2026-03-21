export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/tickets
 *
 * List all tickets for the authenticated user.
 * Includes event details, society info, and QR status.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First, try to get paid event tickets
    let paidTickets = [];
    try {
      const ticketsResult = await query(
        `SELECT
          t.id,
          t.ticket_number,
          t.status,
          t.purchased_at,
          e.id AS event_id,
          e.title AS event_title,
          e.location AS event_venue,
          e.event_start,
          e.event_end,
          e.banner_url AS event_banner,
          e.is_paid,
          e.is_cancelled,
          s.name AS society_name,
          s.logo_url AS society_logo,
          CASE WHEN qr.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_qr,
          'TICKET' AS source_type
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        JOIN societies s ON e.society_id = s.id
        LEFT JOIN ticket_qr_codes qr ON qr.ticket_id = t.id AND qr.is_active = TRUE
        WHERE t.user_id = $1
          AND t.status != 'CANCELLED'`,
        [user.userId]
      );
      paidTickets = ticketsResult.rows;
    } catch (ticketErr) {
      console.error('Error fetching paid tickets:', ticketErr);
    }

    // Then, try to get free event registrations
    let freeRegistrations = [];
    try {
      const regResult = await query(
        `SELECT
          er.id,
          'FREE-' || SUBSTRING(er.id::text, 1, 8) AS ticket_number,
          'APPROVED' AS status,
          er.registered_at AS purchased_at,
          e.id AS event_id,
          e.title AS event_title,
          e.location AS event_venue,
          e.event_start,
          e.event_end,
          e.banner_url AS event_banner,
          e.is_paid,
          e.is_cancelled,
          s.name AS society_name,
          s.logo_url AS society_logo,
          FALSE AS has_qr,
          'REGISTRATION' AS source_type
        FROM event_registrations er
        JOIN events e ON er.event_id = e.id
        JOIN societies s ON e.society_id = s.id
        WHERE er.user_id = $1
          AND er.cancelled_at IS NULL`,
        [user.userId]
      );
      freeRegistrations = regResult.rows;
    } catch (regErr) {
      console.error('Error fetching registrations:', regErr);
    }

    // Combine and sort by event_start descending
    const allTickets = [...paidTickets, ...freeRegistrations].sort(
      (a, b) => new Date(b.event_start).getTime() - new Date(a.event_start).getTime()
    );

    return NextResponse.json(allTickets);
  } catch (error) {
    console.error('Tickets list error:', error);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}
