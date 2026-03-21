export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateQrPayload } from '@/lib/qr';
import { getClient } from '@/lib/db';

/**
 * GET /api/tickets/[id]
 *
 * Get detailed ticket info including QR data.
 * Auto-generates QR if it doesn't exist yet (for approved tickets).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // First try to find as a paid ticket
    let result = await query(
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
        s.name AS society_name,
        s.id AS society_id,
        s.logo_url AS society_logo,
        u.full_name AS attendee_name,
        u.email AS attendee_email,
        qr.qr_data,
        qr.is_scanned,
        qr.scanned_at,
        'TICKET' AS source_type
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN societies s ON e.society_id = s.id
      JOIN users u ON t.user_id = u.id
      LEFT JOIN ticket_qr_codes qr ON qr.ticket_id = t.id AND qr.is_active = TRUE
      WHERE t.id = $1 AND t.user_id = $2`,
      [id, user.userId]
    );

    let ticket = result.rows[0];
    let sourceType = 'TICKET';

    // If not found as paid ticket, try as free registration
    if (!ticket) {
      try {
        result = await query(
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
            s.name AS society_name,
            s.id AS society_id,
            s.logo_url AS society_logo,
            u.full_name AS attendee_name,
            u.email AS attendee_email,
            NULL AS qr_data,
            FALSE AS is_scanned,
            NULL AS scanned_at,
            'REGISTRATION' AS source_type
          FROM event_registrations er
          JOIN events e ON er.event_id = e.id
          JOIN societies s ON e.society_id = s.id
          JOIN users u ON er.user_id = u.id
          WHERE er.id = $1 AND er.user_id = $2 AND er.cancelled_at IS NULL`,
          [id, user.userId]
        );
        ticket = result.rows[0];
        sourceType = 'REGISTRATION';
      } catch (regErr) {
        console.error('Error fetching registration:', regErr);
      }
    }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Auto-generate QR if ticket is approved and no QR exists
    // Note: QR generation for free registrations requires the registration_id column in ticket_qr_codes
    if (ticket.status === 'APPROVED' && !ticket.qr_data && sourceType === 'TICKET') {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const qrPayload = generateQrPayload({
          type: 'T',
          id: ticket.id,
          eventId: ticket.event_id,
          userId: user.userId,
        });

        await client.query(
          `INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active)
           VALUES ($1, $2, TRUE)
           ON CONFLICT DO NOTHING`,
          [ticket.id, qrPayload]
        );

        await client.query('COMMIT');
        ticket.qr_data = qrPayload;
      } catch (qrErr) {
        await client.query('ROLLBACK');
        console.error('QR auto-generation error:', qrErr);
        // Non-fatal — ticket is still returned without QR
      } finally {
        client.release();
      }
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Ticket detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 });
  }
}
