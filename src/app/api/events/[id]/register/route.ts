import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/events/[id]/register
 *
 * Register current user for an event.
 *
 * Rules:
 *   - Only active user (status = ACTIVE)
 *   - Cannot register twice (UNIQUE constraint)
 *   - Cannot exceed max_participants
 *   - Cannot register after registration_end deadline
 *   - Cannot register if event cancelled/completed
 *   - Cannot register if society DEACTIVATED
 *   - If visibility = MEMBERS_ONLY, must be active society member
 *
 * Audit log: EVENT_REGISTERED
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
              e.event_start, e.event_end, e.registration_end, e.max_participants,
              e.visibility,
              s.status as society_status, s.name as society_name
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
        return NextResponse.json(
          { error: 'This event is for society members only' },
          { status: 403 }
        );
      }
    }

    // ── Max participants check ────────────────────────────────────────
    if (event.max_participants) {
      const countResult = await client.query(
        `SELECT COUNT(*) as cnt FROM event_registrations
         WHERE event_id = $1 AND cancelled_at IS NULL`,
        [eventId]
      );
      const currentCount = parseInt(countResult.rows[0].cnt, 10);
      if (currentCount >= event.max_participants) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Event has reached maximum participants' }, { status: 409 });
      }
    }

    // ── Check duplicate registration ──────────────────────────────────
    const existingReg = await client.query(
      `SELECT id, cancelled_at FROM event_registrations
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, user.userId]
    );

    let registrationId: string;

    if (existingReg.rows.length > 0) {
      if (existingReg.rows[0].cancelled_at === null) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'You are already registered for this event' }, { status: 409 });
      }
      // Re-register (was previously cancelled)
      const reReg = await client.query(
        `UPDATE event_registrations
         SET cancelled_at = NULL, registered_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [existingReg.rows[0].id]
      );
      registrationId = reReg.rows[0].id;
    } else {
      // New registration
      const newReg = await client.query(
        `INSERT INTO event_registrations (event_id, user_id)
         VALUES ($1, $2)
         RETURNING id`,
        [eventId, user.userId]
      );
      registrationId = newReg.rows[0].id;
    }

    // ── Audit log ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ('EVENT_REGISTERED', $1, $2, 'event_registration', $3, $4, $5)`,
      [
        user.userId,
        event.society_id,
        registrationId,
        JSON.stringify({ event_id: eventId, user_id: user.userId }),
        JSON.stringify({
          eventTitle: event.title,
          societyName: event.society_name,
          registeredBy: user.fullName,
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      registration: {
        id: registrationId,
        eventId,
        eventTitle: event.title,
      },
    }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');

    // Handle unique constraint violation gracefully
    if (error instanceof Error && error.message.includes('uq_event_registration')) {
      return NextResponse.json({ error: 'You are already registered for this event' }, { status: 409 });
    }

    console.error('Event registration error:', error);
    return NextResponse.json({ error: 'Failed to register for event' }, { status: 500 });
  } finally {
    client.release();
  }
}
