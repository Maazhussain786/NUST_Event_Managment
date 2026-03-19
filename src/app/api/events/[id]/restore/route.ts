export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
} from '@/lib/api-utils';

/**
 * POST /api/events/[id]/restore
 * Restore a soft-deleted event.
 * Requires MANAGE_EVENTS privilege. Only works within 30 days of deletion.
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
      `SELECT id, society_id, title, deleted_at, deleted_by, is_cancelled
       FROM events WHERE id = $1 FOR UPDATE`,
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Event');
    }

    const event = eventResult.rows[0];

    if (!event.deleted_at) {
      await client.query('ROLLBACK');
      return ApiErrors.conflict('Event is not deleted');
    }

    // Only allow restore within 30 days
    const deletedAt = new Date(event.deleted_at);
    const daysSinceDeletion = (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDeletion > 30) {
      await client.query('ROLLBACK');
      return ApiErrors.conflict('Event was deleted more than 30 days ago and cannot be restored');
    }

    // Auth
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'MANAGE_EVENTS') AS allowed`,
      [user.userId, event.society_id]
    );
    if (!privCheck.rows[0].allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have MANAGE_EVENTS privilege');
    }

    // Restore: clear deleted_at/deleted_by, keep is_cancelled=false
    await client.query(
      `UPDATE events
       SET deleted_at = NULL, deleted_by = NULL, is_cancelled = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [eventId]
    );

    await writeAuditLog(
      {
        action: 'EVENT_RESTORED',
        performedBy: user.userId,
        societyId: event.society_id,
        targetType: 'event',
        targetId: eventId,
        oldValue: { deleted_at: event.deleted_at, deleted_by: event.deleted_by },
        newValue: { deleted_at: null, is_cancelled: false },
        metadata: { restoredBy: user.fullName, daysSinceDeletion: Math.floor(daysSinceDeletion) },
        ipAddress: ip,
      },
      client
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return ApiErrors.serverError('Restore event error:', error);
  } finally {
    client.release();
  }
}
