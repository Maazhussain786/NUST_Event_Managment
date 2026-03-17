export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { verifyQrPayload } from '@/lib/qr';

/**
 * POST /api/events/[id]/check-in
 *
 * Check in a user via QR code scan.
 * Handles both paid (ticket) and free (registration) events.
 *
 * Authorization: Requires SCAN_QR privilege (President, VP, Director, DD).
 *
 * Input:
 *   - qr_payload: the HMAC-signed QR string
 *
 * Flow:
 *   1. Verify HMAC signature
 *   2. Check scanner has SCAN_QR privilege
 *   3. Validate QR event matches route event
 *   4. Validate ticket/registration exists and is valid
 *   5. Prevent double check-in
 *   6. Prevent check-in for suspended users
 *   7. Prevent check-in for deactivated society
 *   8. Prevent check-in after event_end
 *   9. Insert event_attendance record
 *   10. Mark ticket.checked_in_at / qr_code.is_scanned
 *   11. Audit log: QR_SCANNED
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: eventId } = params;
    const body = await req.json();
    const { qr_payload } = body;

    if (!qr_payload) {
      return NextResponse.json({ error: 'qr_payload is required' }, { status: 400 });
    }

    // ── 1. Verify QR signature ────────────────────────────────────────
    const qrData = verifyQrPayload(qr_payload);
    if (!qrData) {
      return NextResponse.json({ error: 'Invalid or tampered QR code' }, { status: 400 });
    }

    // ── 2. Validate QR event matches route ────────────────────────────
    if (qrData.eventId !== eventId) {
      return NextResponse.json({ error: 'QR code does not match this event' }, { status: 400 });
    }

    await client.query('BEGIN');

    // ── 3. Fetch event ────────────────────────────────────────────────
    const eventResult = await client.query(
      `SELECT e.id, e.title, e.society_id, e.is_cancelled, e.status,
              e.event_start, e.event_end, e.is_paid,
              s.status AS society_status, s.name AS society_name
       FROM events e
       JOIN societies s ON e.society_id = s.id
       WHERE e.id = $1
       FOR UPDATE OF e`,
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventResult.rows[0];

    // ── 4. Society must be APPROVED ───────────────────────────────────
    if (event.society_status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society is deactivated' }, { status: 409 });
    }

    // ── 5. Event must not be cancelled ────────────────────────────────
    if (event.is_cancelled || event.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event is cancelled' }, { status: 409 });
    }

    // ── 6. Event must not be past end ─────────────────────────────────
    if (new Date(event.event_end) < new Date()) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event has ended — check-in is closed' }, { status: 409 });
    }

    // ── 7. Scanner must have SCAN_QR privilege ────────────────────────
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'SCAN_QR')`,
      [user.userId, event.society_id]
    );
    if (!privCheck.rows[0].fn_has_privilege && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'You do not have SCAN_QR privilege' }, { status: 403 });
    }

    // ── 8. Check attendee user is active and not suspended ────────────
    const attendeeCheck = await client.query(
      `SELECT id, status, full_name FROM users WHERE id = $1`,
      [qrData.userId]
    );
    if (attendeeCheck.rows.length === 0 || attendeeCheck.rows[0].status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Attendee account is not active' }, { status: 403 });
    }

    // Check suspension in society
    const suspCheck = await client.query(
      `SELECT 1 FROM society_memberships
       WHERE user_id = $1 AND society_id = $2 AND suspended_at IS NOT NULL`,
      [qrData.userId, event.society_id]
    );
    if (suspCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Attendee is suspended from this society' }, { status: 403 });
    }

    // ── 9. Validate ticket or registration with row-level lock ────────
    let ticketId: string | null = null;
    let registrationId: string | null = null;
    let qrCodeId: string | null = null;

    if (qrData.type === 'T') {
      // Paid event — validate ticket
      const ticketResult = await client.query(
        `SELECT t.id, t.status, t.checked_in_at
         FROM tickets t
         WHERE t.id = $1 AND t.event_id = $2 AND t.user_id = $3
         FOR UPDATE`,
        [qrData.id, eventId, qrData.userId]
      );
      if (ticketResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
      const ticket = ticketResult.rows[0];

      if (ticket.status !== 'APPROVED') {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: `Ticket is not approved (status: ${ticket.status})` },
          { status: 409 }
        );
      }
      if (ticket.checked_in_at) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Ticket already used for check-in' }, { status: 409 });
      }

      ticketId = ticket.id;

      const existingAttendance = await client.query(
        `SELECT id FROM event_attendance WHERE event_id = $1 AND user_id = $2`,
        [eventId, qrData.userId]
      );
      if (existingAttendance.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'User already checked in for this event' }, { status: 409 });
      }

      // Mark ticket as checked in
      const ticketUpdate = await client.query(
        `UPDATE tickets
         SET checked_in_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND checked_in_at IS NULL
         RETURNING id`,
        [ticketId]
      );
      if (ticketUpdate.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Ticket already used for check-in' }, { status: 409 });
      }

      // Mark QR as scanned
      const qrUpdate = await client.query(
        `UPDATE ticket_qr_codes
         SET is_scanned = TRUE, scanned_at = NOW(), scanned_by = $1
         WHERE ticket_id = $2 AND is_active = TRUE AND is_scanned = FALSE
         RETURNING id`,
        [user.userId, ticketId]
      );
      if (qrUpdate.rows.length > 0) {
        qrCodeId = qrUpdate.rows[0].id;
      }

    } else {
      // Free event — validate registration
      const regResult = await client.query(
        `SELECT er.id, er.cancelled_at
         FROM event_registrations er
         WHERE er.id = $1 AND er.event_id = $2 AND er.user_id = $3
         FOR UPDATE`,
        [qrData.id, eventId, qrData.userId]
      );
      if (regResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
      }
      if (regResult.rows[0].cancelled_at) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Registration has been cancelled' }, { status: 409 });
      }

      registrationId = regResult.rows[0].id;

      const existingAttendance = await client.query(
        `SELECT id FROM event_attendance WHERE event_id = $1 AND user_id = $2`,
        [eventId, qrData.userId]
      );
      if (existingAttendance.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'User already checked in for this event' }, { status: 409 });
      }

      // Mark QR as scanned
      const qrUpdate = await client.query(
        `UPDATE ticket_qr_codes
         SET is_scanned = TRUE, scanned_at = NOW(), scanned_by = $1
         WHERE registration_id = $2 AND is_active = TRUE AND is_scanned = FALSE
         RETURNING id`,
        [user.userId, registrationId]
      );
      if (qrUpdate.rows.length > 0) {
        qrCodeId = qrUpdate.rows[0].id;
      }
    }

    // ── 11. Insert attendance record ──────────────────────────────────
    const attendanceResult = await client.query(
      `INSERT INTO event_attendance (event_id, user_id, ticket_id, registration_id, qr_code_id, checked_in_at, checked_in_by)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       RETURNING id`,
      [eventId, qrData.userId, ticketId, registrationId, qrCodeId, user.userId]
    );

    // ── 12. Audit log ─────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ('QR_SCANNED', $1, $2, 'event_attendance', $3, $4, $5)`,
      [
        user.userId,
        event.society_id,
        attendanceResult.rows[0].id,
        JSON.stringify({
          event_id: eventId,
          user_id: qrData.userId,
          ticket_id: ticketId,
          registration_id: registrationId,
          qr_type: qrData.type,
        }),
        JSON.stringify({
          eventTitle: event.title,
          societyName: event.society_name,
          attendeeName: attendeeCheck.rows[0].full_name,
          scannedBy: user.fullName,
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      attendance: {
        id: attendanceResult.rows[0].id,
        eventId,
        userId: qrData.userId,
        attendeeName: attendeeCheck.rows[0].full_name,
        type: qrData.type === 'T' ? 'TICKET' : 'REGISTRATION',
      },
    }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');

    if ((error as { code?: string })?.code === '23505' || (error instanceof Error && error.message.includes('uq_attendance_event_user'))) {
      return NextResponse.json({ error: 'User already checked in for this event' }, { status: 409 });
    }

    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Failed to process check-in' }, { status: 500 });
  } finally {
    client.release();
  }
}
