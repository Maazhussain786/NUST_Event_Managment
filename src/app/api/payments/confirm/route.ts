export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateQrPayload } from '@/lib/qr';

/**
 * POST /api/payments/confirm
 *
 * Confirm payment for a pending ticket.
 *
 * Input:
 *   - payment_reference: UUID (from purchase-ticket response)
 *   - transaction_id: string (simulated gateway transaction ID)
 *
 * Rules:
 *   - Must match existing PENDING ticket
 *   - Re-checks capacity before approval (prevents overselling)
 *   - Marks ticket status = APPROVED
 *   - participants_count incremented by DB trigger
 *   - reserved_count decremented by DB trigger
 *   - Generates QR code for approved ticket
 *   - Idempotent: if already APPROVED, returns success without mutation
 *
 * Audit: TICKET_APPROVED
 */
export async function POST(req: NextRequest) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { payment_reference, transaction_id } = body;

    if (!payment_reference) {
      return NextResponse.json({ error: 'payment_reference is required' }, { status: 400 });
    }
    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 });
    }

    await client.query('BEGIN');

    // ── Find ticket by payment_reference with event lock ──────────────
    // Lock both ticket AND event to prevent race conditions
    const ticketResult = await client.query(
      `SELECT t.id, t.event_id, t.user_id, t.status, t.payment_reference,
              e.title AS event_title, e.society_id, e.ticket_price,
              e.max_participants, e.participants_count, e.is_cancelled,
              s.name AS society_name
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       JOIN societies s ON s.id = e.society_id
       WHERE t.payment_reference = $1
       FOR UPDATE OF t, e`,
      [payment_reference]
    );

    if (ticketResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Ticket not found for this payment reference' }, { status: 404 });
    }

    const ticket = ticketResult.rows[0];

    // ── Verify ownership ──────────────────────────────────────────────
    if (ticket.user_id !== user.userId && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'This ticket does not belong to you' }, { status: 403 });
    }

    // ── Idempotent: already approved ──────────────────────────────────
    if (ticket.status === 'APPROVED') {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: true,
        message: 'Payment already confirmed',
        ticket: {
          id: ticket.id,
          status: 'APPROVED',
          eventTitle: ticket.event_title,
        },
      }, { status: 200 });
    }

    // ── Must be PENDING ───────────────────────────────────────────────
    if (ticket.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `Cannot confirm payment for ticket with status: ${ticket.status}` },
        { status: 409 }
      );
    }

    // ── Check if event is still valid ─────────────────────────────────
    if (ticket.is_cancelled) {
      // Cancel the ticket since event is cancelled
      await client.query(
        `UPDATE tickets SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [ticket.id]
      );
      await client.query('COMMIT');
      return NextResponse.json(
        { error: 'Event has been cancelled. Your ticket has been cancelled.' },
        { status: 409 }
      );
    }

    // ── CRITICAL: Re-check capacity before approval ───────────────────
    // This prevents overselling when multiple PENDING tickets are approved concurrently
    if (ticket.max_participants !== null) {
      if (ticket.participants_count >= ticket.max_participants) {
        // Capacity exceeded - reject the ticket
        await client.query(
          `UPDATE tickets SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`,
          [ticket.id]
        );

        // Log the capacity exceeded event
        await client.query(
          `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, metadata)
           VALUES ('CAPACITY_EXCEEDED', $1, $2, 'ticket', $3, $4)`,
          [
            user.userId,
            ticket.society_id,
            ticket.id,
            JSON.stringify({
              eventTitle: ticket.event_title,
              maxParticipants: ticket.max_participants,
              currentCount: ticket.participants_count,
              message: 'Ticket rejected due to capacity being reached during payment',
            }),
          ]
        );

        await client.query('COMMIT');
        return NextResponse.json(
          { error: 'Event has reached maximum capacity. Payment cannot be processed. Please contact support for a refund.' },
          { status: 409 }
        );
      }
    }

    // ── Approve ticket (trigger increments participants_count) ────────
    await client.query(
      `UPDATE tickets
       SET status = 'APPROVED', approved_at = NOW(), approved_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [user.userId, ticket.id]
    );

    // ── Generate QR code ──────────────────────────────────────────────
    const qrPayload = generateQrPayload({
      type: 'T',
      id: ticket.id,
      eventId: ticket.event_id,
      userId: ticket.user_id,
    });

    // Deactivate any existing QR for this ticket
    await client.query(
      `UPDATE ticket_qr_codes SET is_active = FALSE WHERE ticket_id = $1 AND is_active = TRUE`,
      [ticket.id]
    );

    const qrResult = await client.query(
      `INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING id`,
      [ticket.id, qrPayload]
    );

    // ── Audit log ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('TICKET_APPROVED', $1, $2, 'ticket', $3, $4, $5, $6)`,
      [
        user.userId,
        ticket.society_id,
        ticket.id,
        JSON.stringify({ status: 'PENDING' }),
        JSON.stringify({ status: 'APPROVED', transaction_id }),
        JSON.stringify({
          eventTitle: ticket.event_title,
          societyName: ticket.society_name,
          ticketPrice: ticket.ticket_price,
          paymentReference: payment_reference,
          transactionId: transaction_id,
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        status: 'APPROVED',
        eventTitle: ticket.event_title,
        qrCodeId: qrResult.rows[0].id,
        qrPayload,
      },
    }, { status: 200 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Payment confirmation error:', error);
    return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
  } finally {
    client.release();
  }
}
