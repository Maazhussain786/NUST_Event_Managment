export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics
 *
 * Platform-wide analytics for SuperAdmin dashboard.
 * Returns aggregate statistics, trends, and top entities.
 */

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type QueryRows = { rows: Record<string, unknown>[] };

async function safeQuery(sql: string): Promise<QueryRows> {
  try {
    return await query(sql);
  } catch (error) {
    console.error("Analytics subquery failed:", error);
    return { rows: [] };
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [
      userGrowth,
      eventsByMonth,
      eventsByStatus,
      societiesByStatus,
      topSocieties,
      registrationStats,
      revenueStats,
      storageOverview,
      recentActivity,
    ] = await Promise.all([
      // User registrations by month (last 12 months)
      safeQuery(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COUNT(*) AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `),

      // Events created by month (last 12 months)
      safeQuery(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COUNT(*) AS count
        FROM events
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `),

      // Events by status
      safeQuery(`
        SELECT status, COUNT(*) AS count
        FROM events
        GROUP BY status
        ORDER BY count DESC
      `),

      // Societies by status
      safeQuery(`
        SELECT status, COUNT(*) AS count
        FROM societies
        GROUP BY status
        ORDER BY count DESC
      `),

      // Top 10 societies by member count
      safeQuery(`
        SELECT s.id, s.name, s.logo_url, s.status,
               COUNT(DISTINCT sm.user_id) AS member_count,
               COUNT(DISTINCT e.id) AS event_count
        FROM societies s
        LEFT JOIN society_memberships sm ON sm.society_id = s.id AND sm.is_active = TRUE
        LEFT JOIN events e ON e.society_id = s.id
        WHERE s.status = 'APPROVED'
        GROUP BY s.id
        ORDER BY member_count DESC
        LIMIT 10
      `),

      // Registration stats
      safeQuery(`
        SELECT
          COUNT(*) AS total_registrations,
          COUNT(CASE WHEN cancelled_at IS NULL THEN 1 END) AS active_registrations,
          COUNT(CASE WHEN registered_at >= NOW() - INTERVAL '30 days' THEN 1 END) AS last_30_days,
          COUNT(CASE WHEN registered_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS last_7_days
        FROM event_registrations
      `),

      // Revenue stats (paid tickets)
      safeQuery(`
        SELECT
          COUNT(*) AS total_tickets,
          COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) AS approved_tickets,
          COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS total_revenue,
          COUNT(CASE WHEN t.purchased_at >= NOW() - INTERVAL '30 days' THEN 1 END) AS tickets_last_30_days
        FROM tickets t
        JOIN events e ON e.id = t.event_id
      `),

      // Storage overview from view
      safeQuery(`
        SELECT
          COUNT(*) AS total_societies,
          SUM(storage_used_bytes) AS total_used_bytes,
          SUM(storage_quota_bytes) AS total_quota_bytes,
          MAX(storage_used_bytes) AS max_used_bytes,
          AVG(CASE WHEN storage_used_bytes > 0 THEN storage_used_bytes ELSE NULL END) AS avg_used_bytes
        FROM v_society_storage_usage
      `),

      // Recent significant actions (last 20)
      safeQuery(`
        SELECT al.id, al.action, al.created_at,
               u.full_name AS user_name,
               s.name AS society_name,
               al.metadata
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.performed_by
        LEFT JOIN societies s ON s.id = al.society_id
        ORDER BY al.created_at DESC
        LIMIT 20
      `),
    ]);

    const registrationDefaults = {
      total_registrations: "0",
      active_registrations: "0",
      last_30_days: "0",
      last_7_days: "0",
    };

    const revenueDefaults = {
      total_tickets: "0",
      approved_tickets: "0",
      total_revenue: "0",
      tickets_last_30_days: "0",
    };

    const storageDefaults = {
      total_societies: "0",
      total_used_bytes: "0",
      total_quota_bytes: "0",
      max_used_bytes: "0",
      avg_used_bytes: "0",
    };

    return NextResponse.json({
      userGrowth: userGrowth.rows,
      eventsByMonth: eventsByMonth.rows,
      eventsByStatus: eventsByStatus.rows,
      societiesByStatus: societiesByStatus.rows,
      topSocieties: topSocieties.rows,
      registrationStats: registrationStats.rows[0] || registrationDefaults,
      revenueStats: revenueStats.rows[0] || revenueDefaults,
      storageOverview: storageOverview.rows[0] || storageDefaults,
      recentActivity: recentActivity.rows,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
