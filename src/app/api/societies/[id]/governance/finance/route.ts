export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/finance — financial overview
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

    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format');

    // Revenue stats
    const [revenueStats, revenueByEvent, recentTransactions] = await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS total_revenue,
           COUNT(*) AS total_tickets,
           COUNT(CASE WHEN t.status = 'APPROVED' THEN 1 END) AS approved_tickets,
           COUNT(CASE WHEN t.status = 'PENDING' THEN 1 END) AS pending_tickets
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         WHERE e.society_id = $1`,
        [societyId]
      ),
      query(
        `SELECT e.id AS event_id, e.title AS event_title, e.ticket_price,
                COUNT(t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold,
                COALESCE(SUM(e.ticket_price) FILTER (WHERE t.status = 'APPROVED'), 0) AS revenue
         FROM events e
         LEFT JOIN tickets t ON e.id = t.event_id
         WHERE e.society_id = $1 AND e.is_paid = TRUE
         GROUP BY e.id, e.title, e.ticket_price
         ORDER BY revenue DESC`,
        [societyId]
      ),
      query(
        `SELECT t.id, t.status, t.purchased_at, t.approved_at,
                e.title AS event_title, e.ticket_price,
                u.full_name AS buyer_name, u.email AS buyer_email
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         JOIN users u ON t.user_id = u.id
         WHERE e.society_id = $1
         ORDER BY t.created_at DESC
         LIMIT 50`,
        [societyId]
      ),
    ]);

    // CSV export
    if (format === 'csv') {
      const rows = recentTransactions.rows;
      let csv = 'Ticket ID,Event,Buyer,Email,Amount,Status,Purchased At,Approved At\n';
      for (const row of rows) {
        csv += `${row.id},"${row.event_title}","${row.buyer_name}",${row.buyer_email},${row.ticket_price},${row.status},${row.purchased_at || ''},${row.approved_at || ''}\n`;
      }
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="finance-${societyId}.csv"`,
        },
      });
    }

    const stats = revenueStats.rows[0];

    return NextResponse.json({
      totalRevenue: stats.total_revenue,
      totalTickets: stats.total_tickets,
      approvedTickets: stats.approved_tickets,
      pendingTickets: stats.pending_tickets,
      revenueByEvent: revenueByEvent.rows,
      recentTransactions: recentTransactions.rows,
    });
  } catch (error) {
    console.error('Finance error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
