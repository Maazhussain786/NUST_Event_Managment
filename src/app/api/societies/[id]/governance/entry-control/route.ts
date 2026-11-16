export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getEventAccess, rules } from '@/lib/rbac';
import { CONTAINERS, resolveMediaFields } from '@/lib/blob';

// GET /api/societies/[id]/governance/entry-control?eventId=xxx — get entry stats + recent scans
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    // Entry dashboard: people who check others in or may view registrations (SRS 8.1)
    const viewerAccess = await getEventAccess(user, eventId);
    if (!viewerAccess || viewerAccess.event.society_id !== societyId ||
        !(rules.checkIn(viewerAccess) || rules.viewRegistrations(viewerAccess))) {
      return NextResponse.json({ error: 'You cannot view entry control for this event' }, { status: 403 });
    }

    // Verify event belongs to society
    const eventCheck = await query(
      `SELECT id, title, is_paid, max_participants, participants_count
       FROM events WHERE id = $1 AND society_id = $2`,
      [eventId, societyId]
    );
    if (eventCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found in this society' }, { status: 404 });
    }

    const event = eventCheck.rows[0];

    // Get stats
    const [registrations, ticketed, checkedIn, recentScans] = await Promise.all([
      query(
        `SELECT COUNT(*) AS count FROM event_registrations
         WHERE event_id = $1 AND cancelled_at IS NULL`,
        [eventId]
      ),
      query(
        `SELECT COUNT(*) AS count FROM tickets
         WHERE event_id = $1 AND status = 'APPROVED'`,
        [eventId]
      ),
      query(
        `SELECT COUNT(*) AS count FROM event_attendance WHERE event_id = $1`,
        [eventId]
      ),
      query(
        `SELECT ea.id, ea.checked_in_at, ea.user_id,
                u.full_name, u.email, u.avatar_url,
                CASE WHEN ea.ticket_id IS NOT NULL THEN 'QR' ELSE 'MANUAL' END AS method
         FROM event_attendance ea
         JOIN users u ON ea.user_id = u.id
         WHERE ea.event_id = $1
         ORDER BY ea.checked_in_at DESC LIMIT 50`,
        [eventId]
      ),
    ]);
    const resolvedScans = recentScans.rows.map((scan) =>
      resolveMediaFields(scan, {
        avatar_url: CONTAINERS.PROFILE_PICTURES,
      }),
    );

    return NextResponse.json({
      eventId,
      eventTitle: event.title,
      registered: registrations.rows[0].count,
      ticketed: ticketed.rows[0].count,
      checkedIn: checkedIn.rows[0].count,
      maxParticipants: event.max_participants,
      recentScans: resolvedScans,
    });
  } catch (error) {
    console.error('Entry control GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/societies/[id]/governance/entry-control — manual check-in by email
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;
    const body = await req.json();
    const { eventId, userEmail } = body;

    if (!eventId || !userEmail) {
      return NextResponse.json({ error: 'eventId and userEmail are required' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Manual check: SCAN_QR holders, or Security / Ushers / Crowd Control of this event (SRS 4.8)
    const scannerAccess = await getEventAccess(user, eventId, client);
    if (!scannerAccess || scannerAccess.event.society_id !== societyId || !rules.checkIn(scannerAccess)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'You are not allowed to check people in for this event' }, { status: 403 });
    }

    // Verify event belongs to society
    const eventCheck = await client.query(
      `SELECT e.id, e.title, e.society_id, e.is_paid, e.status, e.is_cancelled, e.event_end,
              s.status AS society_status
       FROM events e
       JOIN societies s ON s.id = e.society_id
       WHERE e.id = $1 AND e.society_id = $2
       FOR UPDATE OF e`,
      [eventId, societyId]
    );
    if (eventCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventCheck.rows[0];
    if (event.society_status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society is deactivated' }, { status: 409 });
    }
    if (event.is_cancelled || event.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event is cancelled' }, { status: 409 });
    }
    if (event.event_end && new Date(event.event_end) < new Date()) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event has ended — check-in is closed' }, { status: 409 });
    }

    // Find user by email
    const userResult = await client.query(
      `SELECT id, full_name, email, status FROM users WHERE LOWER(email) = LOWER($1)`,
      [userEmail.trim()]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'User not found with that email' }, { status: 404 });
    }

    const targetUser = userResult.rows[0];
    if (targetUser.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Attendee account is not active' }, { status: 403 });
    }

    // Check they have a registration or approved ticket
    let ticketId = null;
    let registrationId = null;

    if (event.is_paid) {
      const ticket = await client.query(
        `SELECT id, checked_in_at
         FROM tickets
         WHERE event_id = $1 AND user_id = $2 AND status = 'APPROVED'
         FOR UPDATE`,
        [eventId, targetUser.id]
      );
      if (ticket.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'No approved ticket found for this user' }, { status: 400 });
      }
      ticketId = ticket.rows[0].id;
      if (ticket.rows[0].checked_in_at) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Ticket already used for check-in' }, { status: 409 });
      }

      const existing = await client.query(
        `SELECT id FROM event_attendance WHERE event_id = $1 AND user_id = $2`,
        [eventId, targetUser.id]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'User already checked in' }, { status: 409 });
      }

      // Mark ticket checked in
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
    } else {
      const reg = await client.query(
        `SELECT id, cancelled_at
         FROM event_registrations
         WHERE event_id = $1 AND user_id = $2
         FOR UPDATE`,
        [eventId, targetUser.id]
      );
      if (reg.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'User is not registered for this event' }, { status: 400 });
      }
      if (reg.rows[0].cancelled_at) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Registration has been cancelled' }, { status: 409 });
      }
      registrationId = reg.rows[0].id;

      const existing = await client.query(
        `SELECT id FROM event_attendance WHERE event_id = $1 AND user_id = $2`,
        [eventId, targetUser.id]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'User already checked in' }, { status: 409 });
      }
    }

    // Insert attendance
    const attendance = await client.query(
      `INSERT INTO event_attendance (event_id, user_id, ticket_id, registration_id, checked_in_by, checked_in_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, checked_in_at`,
      [eventId, targetUser.id, ticketId, registrationId, user.userId]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      record: {
        id: attendance.rows[0].id,
        userId: targetUser.id,
        fullName: targetUser.full_name,
        email: targetUser.email,
        checkedInAt: attendance.rows[0].checked_in_at,
        method: 'MANUAL',
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'User already checked in' }, { status: 409 });
    }
    console.error('Manual check-in error:', error);
    return NextResponse.json({ error: 'Failed to check in' }, { status: 500 });
  } finally {
    client.release();
  }
}
