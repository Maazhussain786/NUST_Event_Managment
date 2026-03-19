export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/admin/expire-pending-tickets
 *
 * Expires stale PENDING tickets that haven't been paid within the TTL.
 * Should be called periodically (e.g., every 5-10 minutes via cron).
 *
 * Default TTL: 30 minutes
 *
 * This prevents capacity from being held indefinitely by unpaid tickets.
 *
 * Access: SUPER_ADMIN only (or internal cron with secret)
 */
export async function POST(req: NextRequest) {
  const client = await getClient();
  try {
    // Check for cron secret header (for automated calls)
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    let isAuthorized = false;

    // Allow if cron secret matches
    if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
      isAuthorized = true;
    } else {
      // Otherwise require SUPER_ADMIN
      const user = await getCurrentUser();
      if (user?.userType === 'SUPER_ADMIN') {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse TTL from request body or use default
    let ttlMinutes = 30;
    try {
      const body = await req.json();
      if (body.ttl_minutes && typeof body.ttl_minutes === 'number' && body.ttl_minutes > 0) {
        ttlMinutes = Math.min(body.ttl_minutes, 1440); // Max 24 hours
      }
    } catch {
      // No body or invalid JSON, use default
    }

    await client.query('BEGIN');

    // Call the database function to expire stale tickets
    const result = await client.query(
      `SELECT * FROM fn_expire_stale_pending_tickets($1)`,
      [ttlMinutes]
    );

    const expiredCount = result.rows[0]?.expired_count || 0;
    const affectedEvents = result.rows[0]?.affected_events || [];

    // Log the cleanup if any tickets were expired
    if (expiredCount > 0) {
      await client.query(
        `INSERT INTO audit_logs (action, performed_by, target_type, metadata)
         VALUES ('TICKET_EXPIRED', $1, 'system', $2)`,
        [
          'system',
          JSON.stringify({
            expiredCount,
            ttlMinutes,
            affectedEvents,
            timestamp: new Date().toISOString(),
          }),
        ]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      expired_count: expiredCount,
      affected_events: affectedEvents,
      ttl_minutes: ttlMinutes,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ticket expiry error:', error);
    return NextResponse.json({ error: 'Failed to expire pending tickets' }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * GET /api/admin/expire-pending-tickets
 *
 * Returns statistics about pending tickets that would be expired.
 * Does not actually expire them.
 */
export async function GET(req: NextRequest) {
  try {
    // Check authorization
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const ttlMinutes = parseInt(url.searchParams.get('ttl_minutes') || '30', 10);

    const { query } = await import('@/lib/db');

    const result = await query(
      `SELECT
         COUNT(*) AS total_pending,
         COUNT(*) FILTER (WHERE purchased_at < NOW() - ($1 || ' minutes')::INTERVAL) AS would_expire,
         COUNT(*) FILTER (WHERE purchased_at >= NOW() - ($1 || ' minutes')::INTERVAL) AS still_valid
       FROM tickets
       WHERE status = 'PENDING'`,
      [ttlMinutes]
    );

    const stats = result.rows[0];

    // Get breakdown by event
    const eventBreakdown = await query(
      `SELECT
         e.id AS event_id,
         e.title AS event_title,
         COUNT(*) AS pending_count,
         COUNT(*) FILTER (WHERE t.purchased_at < NOW() - ($1 || ' minutes')::INTERVAL) AS stale_count
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       WHERE t.status = 'PENDING'
       GROUP BY e.id, e.title
       ORDER BY stale_count DESC
       LIMIT 20`,
      [ttlMinutes]
    );

    return NextResponse.json({
      ttl_minutes: ttlMinutes,
      total_pending: parseInt(stats.total_pending),
      would_expire: parseInt(stats.would_expire),
      still_valid: parseInt(stats.still_valid),
      events: eventBreakdown.rows,
    });
  } catch (error) {
    console.error('Ticket expiry stats error:', error);
    return NextResponse.json({ error: 'Failed to get pending ticket stats' }, { status: 500 });
  }
}
