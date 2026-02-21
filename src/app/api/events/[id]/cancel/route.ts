import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/events/[id]/cancel
 *
 * Cancel an event.
 *
 * Authorization:
 *   - CANCEL_EVENT privilege required (via fn_has_privilege)
 *   - Cannot cancel already completed events
 *   - Cannot cancel already cancelled events
 *
 * Behavior:
 *   - Sets is_cancelled = TRUE (trigger sets status = 'CANCELLED')
 *   - Notifies all registered users
 *   - Audit log: EVENT_CANCELLED
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

    let reason = '';
    try {
      const body = await req.json();
      reason = body.reason || '';
    } catch {
      // reason is optional
    }

    await client.query('BEGIN');

    // ── Fetch event ───────────────────────────────────────────────────
    const eventResult = await client.query(
      `SELECT e.id, e.title, e.society_id, e.wing_id, e.portfolio_id,
              e.is_cancelled, e.status, e.event_end,
              s.name as society_name
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

    // ── Cannot cancel already cancelled ───────────────────────────────
    if (event.is_cancelled || event.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event is already cancelled' }, { status: 409 });
    }

    // ── Cannot cancel completed events ────────────────────────────────
    if (event.status === 'COMPLETED' || event.status === 'ARCHIVED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cannot cancel a completed or archived event' }, { status: 409 });
    }

    // ── Authorization: fn_has_privilege ────────────────────────────────
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'CANCEL_EVENT', $3, $4) AS allowed`,
      [user.userId, event.society_id, event.wing_id, event.portfolio_id]
    );
    if (!privCheck.rows[0].allowed) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Forbidden — you do not have CANCEL_EVENT privilege' },
        { status: 403 }
      );
    }

    // ── Cancel the event ──────────────────────────────────────────────
    await client.query(
      `UPDATE events SET is_cancelled = TRUE, updated_at = NOW() WHERE id = $1`,
      [eventId]
    );

    // ── Notify registered users (from event_registrations) ────────────
    const registrations = await client.query(
      `SELECT user_id FROM event_registrations
       WHERE event_id = $1 AND cancelled_at IS NULL`,
      [eventId]
    );

    for (const reg of registrations.rows) {
      await client.query(
        `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
        [
          reg.user_id,
          'Event Cancelled',
          `"${event.title}" by ${event.society_name} has been cancelled.${reason ? ' Reason: ' + reason.trim() : ''}`,
          `/events/${eventId}`,
        ]
      );
    }

    // ── Also notify ticket holders (existing tickets system) ──────────
    const ticketHolders = await client.query(
      `SELECT DISTINCT user_id FROM tickets
       WHERE event_id = $1 AND status IN ('PENDING', 'APPROVED')`,
      [eventId]
    );

    for (const th of ticketHolders.rows) {
      // Avoid duplicate notification if user is in both systems
      const alreadyNotified = registrations.rows.some(
        (r: { user_id: string }) => r.user_id === th.user_id
      );
      if (!alreadyNotified) {
        await client.query(
          `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
          [
            th.user_id,
            'Event Cancelled',
            `"${event.title}" by ${event.society_name} has been cancelled.${reason ? ' Reason: ' + reason.trim() : ''}`,
            `/events/${eventId}`,
          ]
        );
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('EVENT_CANCELLED', $1, $2, 'event', $3, $4, $5, $6)`,
      [
        user.userId,
        event.society_id,
        eventId,
        JSON.stringify({ status: event.status, is_cancelled: false }),
        JSON.stringify({ status: 'CANCELLED', is_cancelled: true }),
        JSON.stringify({
          cancelledBy: user.fullName,
          reason: reason || null,
          notifiedRegistrations: registrations.rows.length,
          notifiedTicketHolders: ticketHolders.rows.length,
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Event "${event.title}" has been cancelled`,
      notifiedUsers: registrations.rows.length + ticketHolders.rows.filter(
        (th: { user_id: string }) => !registrations.rows.some(
          (r: { user_id: string }) => r.user_id === th.user_id
        )
      ).length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel event error:', error);
    return NextResponse.json({ error: 'Failed to cancel event' }, { status: 500 });
  } finally {
    client.release();
  }
}
