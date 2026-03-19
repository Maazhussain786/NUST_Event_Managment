export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/payments/confirm
 *
 * Record payment confirmation for a pending ticket.
 *
 * Input:
 *   - payment_reference: UUID (from purchase-ticket response)
 *   - transaction_id: string (gateway transaction ID)
 *
 * Rules:
 *   - Must match existing PENDING ticket
 *   - Records the transaction_id on the ticket
 *   - Does NOT auto-approve — ticket stays PENDING until society approver reviews
 *   - Notifies society approvers that payment has been submitted
 *
 * NOTE: Approval and QR generation are handled by
 *       /api/societies/[id]/governance/ticket-approvals/[ticketId]
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

    // ── Find ticket by payment_reference ──────────────────────────────
    const ticketResult = await client.query(
      `SELECT t.id, t.event_id, t.user_id, t.status, t.payment_reference,
              e.title AS event_title, e.society_id, e.ticket_price,
              e.is_cancelled,
              s.name AS society_name
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       JOIN societies s ON s.id = e.society_id
       WHERE t.payment_reference = $1
       FOR UPDATE OF t`,
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
        message: 'Ticket already approved',
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

    // ── Record payment confirmation (ticket stays PENDING) ────────────
    // The ticket remains PENDING until a society approver reviews and approves it.
    // We only record the transaction_id so the approver can verify it.
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ('PAYMENT_VERIFIED', $1, $2, 'ticket', $3, $4, $5)`,
      [
        user.userId,
        ticket.society_id,
        ticket.id,
        JSON.stringify({ transaction_id, payment_reference }),
        JSON.stringify({
          eventTitle: ticket.event_title,
          societyName: ticket.society_name,
          ticketPrice: ticket.ticket_price,
          message: 'Payment submitted. Awaiting society approval.',
        }),
      ]
    );

    // ── Notify approvers that payment proof has been submitted ─────────
    try {
      const approvers = await client.query(
        `SELECT DISTINCT sm.user_id
         FROM society_memberships sm
         JOIN roles r ON sm.role_id = r.id
         JOIN role_privileges rp ON r.id = rp.role_id
         JOIN privileges p ON rp.privilege_id = p.id
         WHERE sm.society_id = $1
           AND sm.is_active = TRUE
           AND p.name = 'VERIFY_PAYMENTS'
           AND sm.user_id != $2`,
        [ticket.society_id, user.userId]
      );
      for (const approver of approvers.rows) {
        await client.query(
          `INSERT INTO notifications (user_id, title, body, link)
           VALUES ($1, $2, $3, $4)`,
          [
            approver.user_id,
            'Payment Submitted',
            `${user.fullName || 'A student'} submitted payment for "${ticket.event_title}"`,
            `/society/${ticket.society_id}/approvals`,
          ]
        );
      }
    } catch (notifErr) {
      console.error('Failed to notify approvers:', notifErr);
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: 'Payment recorded. Your ticket is pending approval by the society.',
      ticket: {
        id: ticket.id,
        status: 'PENDING',
        eventTitle: ticket.event_title,
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
