import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/events/[id]/purchase-ticket
 *
 * Purchase a ticket for a paid event.
 *
 * Rules:
 *   - Event must be paid (is_paid = TRUE)
 *   - User must be ACTIVE and not suspended in society
 *   - Society must be APPROVED
 *   - Cannot exceed max_participants (checked via participants_count on locked row)
 *   - Cannot purchase twice (UNIQUE constraint)
 *   - Registration deadline must not have passed
 *   - Event must not be cancelled/completed
 *
 * Returns payment payload (simulated gateway).
 * Ticket created with status = PENDING.
 * participants_count is NOT incremented here — only on APPROVED (payment confirm).
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

    await client.query('BEGIN');

    // ── Verify user is active ─────────────────────────────────────────
    const userCheck = await client.query(
      `SELECT id, status FROM users WHERE id = $1`,
      [user.userId]
    );
    if (userCheck.rows.length === 0 || userCheck.rows[0].status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Your account is not active' }, { status: 403 });
    }

    // ── Fetch event with lock ─────────────────────────────────────────
    const eventResult = await client.query(
      `SELECT e.id, e.title, e.society_id, e.is_cancelled, e.status,
              e.is_paid, e.ticket_price, e.max_participants, e.participants_count,
              e.event_start, e.event_end, e.registration_end, e.visibility,
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

    // ── Must be paid event ────────────────────────────────────────────
    if (!event.is_paid) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'This is a free event. Use /register instead.' },
        { status: 400 }
      );
    }

    // ── Society must be APPROVED ──────────────────────────────────────
    if (event.society_status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society is not active' }, { status: 409 });
    }

    // ── Event must not be cancelled or completed ──────────────────────
    if (event.is_cancelled || event.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event is cancelled' }, { status: 409 });
    }
    if (event.status === 'COMPLETED' || event.status === 'ARCHIVED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event has already ended' }, { status: 409 });
    }

    // ── Registration deadline ─────────────────────────────────────────
    if (event.registration_end && new Date(event.registration_end) < new Date()) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Registration deadline has passed' }, { status: 409 });
    }

    // ── MEMBERS_ONLY visibility check ─────────────────────────────────
    if (event.visibility === 'MEMBERS_ONLY') {
      const memberCheck = await client.query(
        `SELECT 1 FROM society_memberships
         WHERE user_id = $1 AND society_id = $2 AND is_active = TRUE AND suspended_at IS NULL`,
        [user.userId, event.society_id]
      );
      if (memberCheck.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'This event is for society members only' }, { status: 403 });
      }
    }

    // ── Suspension check ──────────────────────────────────────────────
    const suspCheck = await client.query(
      `SELECT 1 FROM society_memberships
       WHERE user_id = $1 AND society_id = $2 AND suspended_at IS NOT NULL`,
      [user.userId, event.society_id]
    );
    if (suspCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'You are suspended from this society' }, { status: 403 });
    }

    // ── Capacity check (PENDING + APPROVED both count toward cap) ─────
    // For paid events, we check pending tickets too to prevent over-selling
    if (event.max_participants) {
      const ticketCount = await client.query(
        `SELECT COUNT(*) AS cnt FROM tickets
         WHERE event_id = $1 AND status IN ('PENDING', 'APPROVED')`,
        [eventId]
      );
      const currentCount = parseInt(ticketCount.rows[0].cnt, 10);
      if (currentCount >= event.max_participants) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Event has reached maximum capacity' }, { status: 409 });
      }
    }

    // ── Duplicate check ──────────────────────────────────────────────
    const existingTicket = await client.query(
      `SELECT id, status FROM tickets WHERE event_id = $1 AND user_id = $2`,
      [eventId, user.userId]
    );
    if (existingTicket.rows.length > 0) {
      const t = existingTicket.rows[0];
      if (t.status === 'PENDING') {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'You already have a pending ticket for this event', ticketId: t.id },
          { status: 409 }
        );
      }
      if (t.status === 'APPROVED') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'You already have an approved ticket' }, { status: 409 });
      }
      // If REJECTED or CANCELLED, allow re-purchase by updating the old row
      if (t.status === 'REJECTED' || t.status === 'CANCELLED') {
        const updated = await client.query(
          `UPDATE tickets
           SET status = 'PENDING', payment_reference = uuid_generate_v4(),
               purchased_at = NOW(), approved_at = NULL, approved_by = NULL,
               cancelled_at = NULL, checked_in_at = NULL, updated_at = NOW()
           WHERE id = $1
           RETURNING id, payment_reference`,
          [t.id]
        );

        await client.query(
          `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
           VALUES ('TICKET_APPROVED', $1, $2, 'ticket', $3, $4, $5)`,
          [
            user.userId,
            event.society_id,
            updated.rows[0].id,
            JSON.stringify({ status: 'PENDING', payment_reference: updated.rows[0].payment_reference }),
            JSON.stringify({ eventTitle: event.title, action: 'ticket_re_purchased' }),
          ]
        );

        await client.query('COMMIT');

        return NextResponse.json({
          success: true,
          ticket: {
            id: updated.rows[0].id,
            status: 'PENDING',
            paymentReference: updated.rows[0].payment_reference,
          },
          payment: {
            amount: parseFloat(event.ticket_price),
            currency: 'PKR',
            reference: updated.rows[0].payment_reference,
            gateway: 'SIMULATED',
            instructions: 'Use POST /api/payments/confirm with this reference to complete payment.',
          },
        }, { status: 200 });
      }
    }

    // ── Create ticket ─────────────────────────────────────────────────
    const ticketResult = await client.query(
      `INSERT INTO tickets (event_id, user_id, status, payment_reference)
       VALUES ($1, $2, 'PENDING', uuid_generate_v4())
       RETURNING id, payment_reference`,
      [eventId, user.userId]
    );

    const ticket = ticketResult.rows[0];

    // ── Audit log ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ('TICKET_APPROVED', $1, $2, 'ticket', $3, $4, $5)`,
      [
        user.userId,
        event.society_id,
        ticket.id,
        JSON.stringify({ status: 'PENDING', payment_reference: ticket.payment_reference }),
        JSON.stringify({
          eventTitle: event.title,
          societyName: event.society_name,
          ticketPrice: event.ticket_price,
          action: 'ticket_purchased',
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        status: 'PENDING',
        paymentReference: ticket.payment_reference,
      },
      payment: {
        amount: parseFloat(event.ticket_price),
        currency: 'PKR',
        reference: ticket.payment_reference,
        gateway: 'SIMULATED',
        instructions: 'Use POST /api/payments/confirm with this reference to complete payment.',
      },
    }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof Error && error.message.includes('uq_ticket_event_user')) {
      return NextResponse.json({ error: 'You already have a ticket for this event' }, { status: 409 });
    }

    console.error('Ticket purchase error:', error);
    return NextResponse.json({ error: 'Failed to purchase ticket' }, { status: 500 });
  } finally {
    client.release();
  }
}
