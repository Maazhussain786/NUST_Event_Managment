export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/finance — financial intelligence dashboard data
 *
 * Returns revenue by society, by event, payment breakdown, recent payments, monthly revenue.
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [
      revenueBySociety,
      revenueByEvent,
      paymentBreakdown,
      recentPayments,
      monthlyRevenue,
    ] = await Promise.all([
      // Revenue by society
      query(`
        SELECT s.id AS society_id, s.name AS society_name,
               COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS total_revenue,
               COUNT(CASE WHEN t.status = 'APPROVED' THEN 1 END) AS ticket_count,
               COUNT(DISTINCT e.id) AS event_count
        FROM societies s
        LEFT JOIN events e ON e.society_id = s.id AND e.ticket_price > 0
        LEFT JOIN tickets t ON t.event_id = e.id
        WHERE s.status = 'APPROVED'
        GROUP BY s.id, s.name
        HAVING COUNT(t.id) > 0
        ORDER BY total_revenue DESC
        LIMIT 20
      `),

      // Revenue by event
      query(`
        SELECT e.id AS event_id, e.title AS event_title, s.name AS society_name,
               e.ticket_price::text AS ticket_price,
               COUNT(CASE WHEN t.status = 'APPROVED' THEN 1 END) AS tickets_sold,
               COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS total_revenue,
               e.event_start AS event_date
        FROM events e
        JOIN societies s ON s.id = e.society_id
        LEFT JOIN tickets t ON t.event_id = e.id
        WHERE e.ticket_price > 0
        GROUP BY e.id, e.title, s.name, e.ticket_price, e.event_start
        ORDER BY total_revenue DESC
        LIMIT 20
      `),

      // Payment breakdown
      query(`
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN t.status = 'APPROVED' THEN 1 END) AS approved,
          COUNT(CASE WHEN t.status = 'PENDING' THEN 1 END) AS pending,
          COUNT(CASE WHEN t.status = 'REJECTED' THEN 1 END) AS rejected,
          COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS total_revenue
        FROM tickets t
        JOIN events e ON e.id = t.event_id
      `),

      // Recent payments
      query(`
        SELECT t.id, u.full_name AS user_name, e.title AS event_title,
               e.ticket_price AS amount, t.status, t.purchased_at
        FROM tickets t
        JOIN users u ON u.id = t.user_id
        JOIN events e ON e.id = t.event_id
        ORDER BY t.purchased_at DESC
        LIMIT 20
      `),

      // Monthly revenue (last 12 months)
      query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', t.purchased_at), 'YYYY-MM') AS month,
          COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS count
        FROM tickets t
        JOIN events e ON e.id = t.event_id
        WHERE t.purchased_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', t.purchased_at)
        ORDER BY month ASC
      `),
    ]);

    return NextResponse.json({
      revenueBySociety: revenueBySociety.rows,
      revenueByEvent: revenueByEvent.rows,
      paymentBreakdown: paymentBreakdown.rows[0],
      recentPayments: recentPayments.rows,
      monthlyRevenue: monthlyRevenue.rows,
    });
  } catch (error) {
    console.error('Finance API error:', error);
    return NextResponse.json({ error: 'Failed to fetch finance data' }, { status: 500 });
  }
}
