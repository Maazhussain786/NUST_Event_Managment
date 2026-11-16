export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireSocietyPrivilege } from "@/lib/rbac";

// GET /api/societies/[id]/governance/finance — financial overview
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: societyId } = params;

    const access = await requireSocietyPrivilege(user, societyId, "VIEW_FINANCE");
    if (access instanceof NextResponse) return access;

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format");

    // Revenue stats
    const [revenueStats, revenueByEvent, recentTransactions] =
      await Promise.all([
        query(
          `SELECT
           COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS total_revenue,
           COUNT(*) AS total_tickets,
           COUNT(CASE WHEN t.status = 'APPROVED' THEN 1 END) AS approved_tickets,
           COUNT(CASE WHEN t.status = 'PENDING' THEN 1 END) AS pending_tickets
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         WHERE e.society_id = $1`,
          [societyId],
        ),
        query(
          `SELECT e.id AS event_id,
          e.title AS event_title,
          e.ticket_price,
          e.event_start AS event_date,
                COUNT(t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold,
          COALESCE(SUM(e.ticket_price) FILTER (WHERE t.status = 'APPROVED'), 0) AS total_revenue
         FROM events e
         LEFT JOIN tickets t ON e.id = t.event_id
         WHERE e.society_id = $1 AND e.is_paid = TRUE
         GROUP BY e.id, e.title, e.ticket_price, e.event_start
         ORDER BY total_revenue DESC`,
          [societyId],
        ),
        query(
          `SELECT t.id,
          t.status,
          t.purchased_at,
          t.approved_at,
          e.title AS event_title,
          e.ticket_price AS amount,
          u.full_name AS user_name,
          u.email AS buyer_email
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         JOIN users u ON t.user_id = u.id
         WHERE e.society_id = $1
         ORDER BY t.created_at DESC
         LIMIT 50`,
          [societyId],
        ),
      ]);

    // CSV export
    if (format === "csv") {
      const rows = recentTransactions.rows;
      let csv =
        "Ticket ID,Event,Buyer,Email,Amount,Status,Purchased At,Approved At\n";
      for (const row of rows) {
        csv += `${row.id},"${row.event_title}","${row.user_name}",${row.buyer_email},${row.amount},${row.status},${row.purchased_at || ""},${row.approved_at || ""}\n`;
      }
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="finance-${societyId}.csv"`,
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
    console.error("Finance error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
