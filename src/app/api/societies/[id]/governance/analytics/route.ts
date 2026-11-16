export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requireSocietyPrivilege } from "@/lib/rbac";

async function safeQuery(sql: string, params: unknown[]) {
  try {
    return await query(sql, params);
  } catch (error) {
    console.warn('Analytics subquery failed; using fallback:', error);
    return { rows: [] as any[] };
  }
}

// GET /api/societies/[id]/governance/analytics — society analytics dashboard
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    const access = await requireSocietyPrivilege(user, societyId, "VIEW_ANALYTICS");
    if (access instanceof NextResponse) return access;

    // Run analytics queries with safe fallbacks so one schema mismatch
    // does not fail the whole page.
    const [memberGrowth, eventsByMonth, registrationStats, revenueByMonth, checkInStats] = await Promise.all([
      safeQuery(
        `SELECT TO_CHAR(assigned_at, 'Mon YY') AS month,
                COUNT(*) AS count
         FROM society_memberships
         WHERE society_id = $1 AND is_active = TRUE
           AND assigned_at >= NOW() - INTERVAL '12 months'
         GROUP BY TO_CHAR(assigned_at, 'Mon YY'), DATE_TRUNC('month', assigned_at)
         ORDER BY DATE_TRUNC('month', assigned_at) ASC`,
        [societyId]
      ),
      safeQuery(
        `SELECT TO_CHAR(event_start, 'Mon YY') AS month,
                COUNT(*) AS count
         FROM events
         WHERE society_id = $1
           AND event_start >= NOW() - INTERVAL '12 months'
         GROUP BY TO_CHAR(event_start, 'Mon YY'), DATE_TRUNC('month', event_start)
         ORDER BY DATE_TRUNC('month', event_start) ASC`,
        [societyId]
      ),
      safeQuery(
        `SELECT
           COUNT(DISTINCT er.user_id) AS total,
           COUNT(DISTINCT er.user_id) FILTER (WHERE er.cancelled_at IS NULL) AS active,
           COUNT(DISTINCT er.user_id) FILTER (
             WHERE er.registered_at >= NOW() - INTERVAL '30 days' AND er.cancelled_at IS NULL
           ) AS last_30_days
         FROM event_registrations er
         JOIN events e ON er.event_id = e.id
         WHERE e.society_id = $1`,
        [societyId]
      ),
      safeQuery(
        `SELECT TO_CHAR(t.approved_at, 'Mon YY') AS month,
                SUM(e.ticket_price) AS revenue
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         WHERE e.society_id = $1 AND t.status = 'APPROVED'
           AND t.approved_at >= NOW() - INTERVAL '12 months'
         GROUP BY TO_CHAR(t.approved_at, 'Mon YY'), DATE_TRUNC('month', t.approved_at)
         ORDER BY DATE_TRUNC('month', t.approved_at) ASC`,
        [societyId]
      ),
      safeQuery(
        `SELECT
           COUNT(DISTINCT ea.user_id) AS checked_in,
           GREATEST(
             (SELECT COUNT(*) FROM event_registrations er2
              JOIN events e2 ON er2.event_id = e2.id
              WHERE e2.society_id = $1 AND er2.cancelled_at IS NULL),
             1
           ) AS total_registrations
         FROM event_attendance ea
         JOIN events e ON ea.event_id = e.id
         WHERE e.society_id = $1`,
        [societyId]
      ),
    ]);

    // Events by status: try status column first, then derive from dates.
    let eventsByStatus = await safeQuery(
      `SELECT status, COUNT(*) AS count
       FROM events WHERE society_id = $1
       GROUP BY status ORDER BY count DESC`,
      [societyId]
    );

    if (eventsByStatus.rows.length === 0) {
      eventsByStatus = await safeQuery(
        `SELECT
           CASE
             WHEN is_cancelled = TRUE THEN 'CANCELLED'
             WHEN NOW() < event_start THEN 'UPCOMING'
             WHEN NOW() BETWEEN event_start AND event_end THEN 'ONGOING'
             ELSE 'COMPLETED'
           END AS status,
           COUNT(*) AS count
         FROM events
         WHERE society_id = $1
         GROUP BY 1
         ORDER BY count DESC`,
        [societyId]
      );
    }

    // Top events: avoid dependency on participants_count and ratings table.
    let topEvents = await safeQuery(
      `SELECT e.id, e.title,
              (
                COALESCE((SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.cancelled_at IS NULL), 0)
                +
                COALESCE((SELECT COUNT(*) FROM tickets t2 WHERE t2.event_id = e.id AND t2.status = 'APPROVED'), 0)
              ) AS participants,
              COALESCE((SELECT SUM(e.ticket_price) FROM tickets t3 WHERE t3.event_id = e.id AND t3.status = 'APPROVED'), 0) AS revenue,
              COALESCE((SELECT AVG(ra.rating) FROM ratings ra WHERE ra.event_id = e.id), 0) AS rating
       FROM events e
       WHERE e.society_id = $1
       ORDER BY participants DESC
       LIMIT 10`,
      [societyId]
    );

    if (topEvents.rows.length === 0) {
      topEvents = await safeQuery(
        `SELECT e.id, e.title,
                (
                  COALESCE((SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.cancelled_at IS NULL), 0)
                  +
                  COALESCE((SELECT COUNT(*) FROM tickets t2 WHERE t2.event_id = e.id AND t2.status = 'APPROVED'), 0)
                ) AS participants,
                COALESCE((SELECT SUM(e.ticket_price) FROM tickets t3 WHERE t3.event_id = e.id AND t3.status = 'APPROVED'), 0) AS revenue,
                0 AS rating
         FROM events e
         WHERE e.society_id = $1
         ORDER BY participants DESC
         LIMIT 10`,
        [societyId]
      );
    }

    const checkIn = checkInStats.rows[0];
    const checkInRate = Number(checkIn.total_registrations) > 0
      ? (Number(checkIn.checked_in) / Number(checkIn.total_registrations)) * 100
      : 0;

    return NextResponse.json({
      memberGrowth: memberGrowth.rows,
      eventsByMonth: eventsByMonth.rows,
      eventsByStatus: eventsByStatus.rows,
      topEvents: topEvents.rows,
      registrationStats: {
        total: (registrationStats.rows[0]?.total || '0'),
        active: (registrationStats.rows[0]?.active || '0'),
        last30Days: (registrationStats.rows[0]?.last_30_days || '0'),
      },
      revenueByMonth: revenueByMonth.rows,
      checkInRate,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
