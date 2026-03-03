export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/analytics — society analytics dashboard
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Verify membership with hierarchy >= 5 (Director+) or super admin
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }
    const level = membership.rows[0]?.hierarchy_level || (user.userType === 'SUPER_ADMIN' ? 10 : 0);
    if (level < 5) {
      return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 });
    }

    // Run all analytics queries in parallel
    const [
      memberGrowth,
      eventsByMonth,
      eventsByStatus,
      topEvents,
      registrationStats,
      revenueByMonth,
      checkInStats
    ] = await Promise.all([
      // Member growth (last 12 months)
      query(
        `SELECT TO_CHAR(assigned_at, 'Mon YY') AS month,
                COUNT(*) AS count
         FROM society_memberships
         WHERE society_id = $1 AND is_active = TRUE
           AND assigned_at >= NOW() - INTERVAL '12 months'
         GROUP BY TO_CHAR(assigned_at, 'Mon YY'), DATE_TRUNC('month', assigned_at)
         ORDER BY DATE_TRUNC('month', assigned_at) ASC`,
        [societyId]
      ),
      // Events by month (last 12 months)
      query(
        `SELECT TO_CHAR(event_start, 'Mon YY') AS month,
                COUNT(*) AS count
         FROM events
         WHERE society_id = $1
           AND event_start >= NOW() - INTERVAL '12 months'
         GROUP BY TO_CHAR(event_start, 'Mon YY'), DATE_TRUNC('month', event_start)
         ORDER BY DATE_TRUNC('month', event_start) ASC`,
        [societyId]
      ),
      // Events by status
      query(
        `SELECT status, COUNT(*) AS count
         FROM events WHERE society_id = $1
         GROUP BY status ORDER BY count DESC`,
        [societyId]
      ),
      // Top 10 events by participation
      query(
        `SELECT e.id, e.title,
                COALESCE(e.participants_count, 0) AS participants,
                COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS revenue,
                COALESCE(AVG(ra.rating), 0) AS rating
         FROM events e
         LEFT JOIN tickets t ON e.id = t.event_id
         LEFT JOIN ratings ra ON e.id = ra.event_id
         WHERE e.society_id = $1
         GROUP BY e.id, e.title, e.participants_count
         ORDER BY participants DESC
         LIMIT 10`,
        [societyId]
      ),
      // Registration stats
      query(
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
      // Revenue by month
      query(
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
      // Check-in rate
      query(
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
