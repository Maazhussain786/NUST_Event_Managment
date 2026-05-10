export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  checkSocietyOperational,
} from '@/lib/api-utils';

/**
 * POST /api/events/[id]/delete
 *
 * Soft-delete an event using deleted_at timestamp (separate from is_cancelled).
 *
 * Guards:
 *   - FOR UPDATE lock on event row
 *   - Cannot delete if approved tickets exist (must cancel first)
 *   - Cannot delete if attendees have checked in
 *   - Cannot delete already-deleted events
 *   - Society must be operational
 *   - Requires DELETE_CONTENT privilege
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const { id: eventId } = await params;
    const ip = extractIpAddress(req);

    await client.query('BEGIN');

    // Fetch event with FOR UPDATE lock
    const eventResult = await client.query(
      `SELECT e.id, e.society_id, e.title, e.status, e.is_cancelled, e.deleted_at
       FROM events e
       WHERE e.id = $1
       FOR UPDATE OF e`,
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Event');
    }

    const event = eventResult.rows[0];

    // Cannot delete already-deleted
    if (event.deleted_at) {
      await client.query('ROLLBACK');
      return ApiErrors.conflict('Event has already been deleted');
    }

    // Check society operational state
    const societyCheck = await checkSocietyOperational(event.society_id, client);
    if (societyCheck) {
      await client.query('ROLLBACK');
      return societyCheck;
    }

    // Auth
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'DELETE_CONTENT') AS allowed`,
      [user.userId, event.society_id]
    );
    if (!privCheck.rows[0].allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have DELETE_CONTENT privilege');
    }

    // Check for approved tickets
    const ticketCheck = await client.query(
      `SELECT COUNT(*) AS count FROM tickets WHERE event_id = $1 AND status = 'APPROVED'`,
      [eventId]
    );
    const approvedCount = parseInt(ticketCheck.rows[0].count);
    if (approvedCount > 0) {
      await client.query('ROLLBACK');
      return ApiErrors.conflict(
        `Cannot delete: ${approvedCount} approved ticket(s) exist. Cancel the event instead.`,
        { approvedTickets: approvedCount }
      );
    }

    // Check for check-ins
    const checkInResult = await client.query(
      `SELECT COUNT(*) AS count FROM event_attendance WHERE event_id = $1`,
      [eventId]
    );
    if (parseInt(checkInResult.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return ApiErrors.conflict(
        'Cannot delete: attendees have already checked in. Cancel the event instead.'
      );
    }

    // Soft delete with deleted_at + is_cancelled for backward compat
    await client.query(
      `UPDATE events
       SET deleted_at = NOW(), deleted_by = $2, is_cancelled = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [eventId, user.userId]
    );

    // Audit with before/after + IP
    await writeAuditLog(
      {
        action: 'EVENT_DELETED',
        performedBy: user.userId,
        societyId: event.society_id,
        targetType: 'event',
        targetId: eventId,
        oldValue: { title: event.title, status: event.status, is_cancelled: event.is_cancelled },
        newValue: { deleted_at: new Date().toISOString(), is_cancelled: true },
        metadata: { deletedBy: user.fullName },
        ipAddress: ip,
      },
      client
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return ApiErrors.serverError('Delete event error:', error);
  } finally {
    client.release();
  }
}

