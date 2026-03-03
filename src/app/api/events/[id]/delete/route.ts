export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * DELETE /api/events/[id]/delete
 * Soft-delete an event. Checks for sold tickets first.
 * Requires MANAGE_EVENTS privilege.
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

    // Fetch event to get society_id
    const eventResult = await client.query(
      `SELECT id, society_id, title, status FROM events WHERE id = $1`,
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventResult.rows[0];

    // Auth
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'MANAGE_EVENTS') AS allowed`,
      [user.userId, event.society_id]
    );
    if (!privCheck.rows[0].allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check for sold tickets
    const ticketCheck = await client.query(
      `SELECT COUNT(*) AS count FROM tickets WHERE event_id = $1 AND status = 'APPROVED'`,
      [eventId]
    );
    if (parseInt(ticketCheck.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `Cannot delete: ${ticketCheck.rows[0].count} approved ticket(s) exist. Cancel the event instead.` },
        { status: 409 }
      );
    }

    // Soft delete (mark as cancelled + deleted flag via is_cancelled)
    await client.query(
      `UPDATE events SET is_cancelled = TRUE, updated_at = NOW() WHERE id = $1`,
      [eventId]
    );

    // Audit
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value)
       VALUES ('EVENT_DELETED', $1, $2, 'event', $3, $4)`,
      [user.userId, event.society_id, eventId, JSON.stringify({ title: event.title })]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete event error:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  } finally {
    client.release();
  }
}
