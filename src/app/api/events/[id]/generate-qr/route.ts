export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateQrPayload } from '@/lib/qr';

/**
 * POST /api/events/[id]/generate-qr
 *
 * Generate or retrieve QR code for a registered user.
 * Works for both free events (registration) and paid events (approved ticket).
 *
 * Rules:
 *   - User must be registered (free) or have APPROVED ticket (paid)
 *   - QR is generated once and cached in ticket_qr_codes
 *   - Subsequent calls return the same active QR
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: eventId } = await params;

    await client.query('BEGIN');

    // ── Fetch event ───────────────────────────────────────────────────
    const eventResult = await client.query(
      `SELECT e.id, e.title, e.is_paid, e.is_cancelled, e.status,
              s.status AS society_status
       FROM events e
       JOIN societies s ON e.society_id = s.id
       WHERE e.id = $1`,
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventResult.rows[0];

    if (event.is_cancelled || event.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event is cancelled' }, { status: 409 });
    }

    if (event.is_paid) {
      // ── Paid event: find APPROVED ticket ──────────────────────────
      const ticketResult = await client.query(
        `SELECT t.id FROM tickets t
         WHERE t.event_id = $1 AND t.user_id = $2 AND t.status = 'APPROVED'`,
        [eventId, user.userId]
      );
      if (ticketResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'No approved ticket found. Complete payment first.' },
          { status: 404 }
        );
      }

      const ticketId = ticketResult.rows[0].id;

      // Check for existing active QR
      const existingQr = await client.query(
        `SELECT id, qr_data FROM ticket_qr_codes
         WHERE ticket_id = $1 AND is_active = TRUE`,
        [ticketId]
      );
      if (existingQr.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          success: true,
          qr: {
            id: existingQr.rows[0].id,
            payload: existingQr.rows[0].qr_data,
            type: 'TICKET',
          },
        });
      }

      // Generate new QR
      const qrPayload = generateQrPayload({
        type: 'T',
        id: ticketId,
        eventId,
        userId: user.userId,
      });

      const qrResult = await client.query(
        `INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active)
         VALUES ($1, $2, TRUE)
         RETURNING id`,
        [ticketId, qrPayload]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        qr: {
          id: qrResult.rows[0].id,
          payload: qrPayload,
          type: 'TICKET',
        },
      }, { status: 201 });

    } else {
      // ── Free event: find active registration ──────────────────────
      const regResult = await client.query(
        `SELECT er.id FROM event_registrations er
         WHERE er.event_id = $1 AND er.user_id = $2 AND er.cancelled_at IS NULL`,
        [eventId, user.userId]
      );
      if (regResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'No active registration found. Register first.' },
          { status: 404 }
        );
      }

      const registrationId = regResult.rows[0].id;

      // Check for existing active QR
      const existingQr = await client.query(
        `SELECT id, qr_data FROM ticket_qr_codes
         WHERE registration_id = $1 AND is_active = TRUE`,
        [registrationId]
      );
      if (existingQr.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          success: true,
          qr: {
            id: existingQr.rows[0].id,
            payload: existingQr.rows[0].qr_data,
            type: 'REGISTRATION',
          },
        });
      }

      // Generate new QR
      const qrPayload = generateQrPayload({
        type: 'R',
        id: registrationId,
        eventId,
        userId: user.userId,
      });

      const qrResult = await client.query(
        `INSERT INTO ticket_qr_codes (registration_id, qr_data, is_active)
         VALUES ($1, $2, TRUE)
         RETURNING id`,
        [registrationId, qrPayload]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        qr: {
          id: qrResult.rows[0].id,
          payload: qrPayload,
          type: 'REGISTRATION',
        },
      }, { status: 201 });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('QR generation error:', error);
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 });
  } finally {
    client.release();
  }
}
