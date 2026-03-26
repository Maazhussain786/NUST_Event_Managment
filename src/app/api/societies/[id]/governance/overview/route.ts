export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTAINERS, resolveMediaFields } from '@/lib/blob';

// GET /api/societies/[id]/governance/overview
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Verify membership or super admin
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Fetch all stats in parallel
    const [
      societyInfo,
      memberCount,
      wingCount,
      portfolioCount,
      eventCounts,
      ticketStats,
      storageInfo,
      upcomingEventsData,
      recentActivityData,
      checkInCount,
      myRoleData,
    ] = await Promise.all([
      // Society info
      query(
        `SELECT id, name, status, logo_url FROM societies WHERE id = $1`,
        [societyId]
      ),
      // Total active members
      query(
        `SELECT COUNT(*) AS count FROM society_memberships
         WHERE society_id = $1 AND is_active = TRUE`,
        [societyId]
      ),
      // Wings count
      query(
        `SELECT COUNT(*) AS count FROM wings WHERE society_id = $1`,
        [societyId]
      ),
      // Portfolios count
      query(
        `SELECT COUNT(*) AS count FROM portfolios p
         JOIN wings w ON p.wing_id = w.id
         WHERE w.society_id = $1`,
        [societyId]
      ),
      // Event counts by status
      query(
        `SELECT
           COUNT(*) AS total,
           COUNT(CASE WHEN status = 'UPCOMING' THEN 1 END) AS upcoming,
           COUNT(CASE WHEN status = 'ONGOING' THEN 1 END) AS ongoing,
           COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed,
           COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) AS cancelled
         FROM events WHERE society_id = $1`,
        [societyId]
      ),
      // Ticket stats
      query(
        `SELECT
           COUNT(*) AS total,
           COUNT(CASE WHEN t.status = 'PENDING' THEN 1 END) AS pending,
           COUNT(CASE WHEN t.status = 'APPROVED' THEN 1 END) AS approved,
           COALESCE(SUM(CASE WHEN t.status = 'APPROVED' THEN e.ticket_price ELSE 0 END), 0) AS revenue
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         WHERE e.society_id = $1`,
        [societyId]
      ),
      // Storage info
      query(
        `SELECT
           COALESCE(ss.storage_quota_bytes, 524288000) AS quota,
           COALESCE(ss.storage_used_bytes, 0) AS used
         FROM society_settings ss
         WHERE ss.society_id = $1`,
        [societyId]
      ),
      // Next 5 upcoming events
      query(
        `SELECT id, title, description, event_start, event_end, location AS venue,
                status, visibility, ticket_price, max_participants,
                COALESCE(participants_count, 0)::TEXT AS participants_count,
                banner_url, thumbnail_url
         FROM events
         WHERE society_id = $1 AND status IN ('UPCOMING', 'ONGOING')
         ORDER BY event_start ASC LIMIT 5`,
        [societyId]
      ),
      // Recent audit log entries (formatted as SocietyAuditLog)
      query(
        `SELECT al.id, al.action, al.target_type AS "targetType",
                al.target_id AS "targetId", al.created_at AS "createdAt",
                u.full_name AS "performedByName", u.email AS "performedByEmail"
         FROM audit_logs al
         LEFT JOIN users u ON al.performed_by = u.id
         WHERE al.society_id = $1
         ORDER BY al.created_at DESC LIMIT 10`,
        [societyId]
      ),
      // Total check-ins
      query(
        `SELECT COUNT(*) AS count FROM event_attendance ea
         JOIN events e ON ea.event_id = e.id
         WHERE e.society_id = $1`,
        [societyId]
      ),
      // My role
      user.userType === 'SUPER_ADMIN'
        ? Promise.resolve({ rows: [{ role_name: 'President', hierarchy_level: 10, membership_id: 'super-admin', wing_id: null, portfolio_id: null }] })
        : query(
            `SELECT sm.id AS membership_id, r.name AS role_name, r.hierarchy_level,
                    sm.wing_id, sm.portfolio_id
             FROM society_memberships sm
             JOIN roles r ON sm.role_id = r.id
             WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
             ORDER BY r.hierarchy_level DESC LIMIT 1`,
            [user.userId, societyId]
          ),
    ]);

    const eventStats = eventCounts.rows[0];
    const tStats = ticketStats.rows[0];
    const storage = storageInfo.rows[0] || { quota: 524288000, used: 0 };
    const soc = societyInfo.rows[0] || {};
    const storagePercentUsed = Number(storage.quota) > 0
      ? (Number(storage.used) / Number(storage.quota)) * 100
      : 0;
    const role = myRoleData.rows[0] || { role_name: 'Member', hierarchy_level: 1 };
    const resolvedSociety = resolveMediaFields(soc, {
      logo_url: CONTAINERS.SOCIETY_MEDIA,
    });
    const resolvedUpcomingEvents = upcomingEventsData.rows.map((eventRow) =>
      resolveMediaFields(eventRow, {
        banner_url: CONTAINERS.EVENT_MEDIA,
        thumbnail_url: CONTAINERS.EVENT_MEDIA,
      }),
    );

    return NextResponse.json({
      society: {
        id: resolvedSociety.id,
        name: resolvedSociety.name,
        status: resolvedSociety.status,
        logoUrl: resolvedSociety.logo_url,
      },
      stats: {
        totalMembers: Number(memberCount.rows[0].count),
        totalWings: Number(wingCount.rows[0].count),
        totalPortfolios: Number(portfolioCount.rows[0].count),
        totalEvents: Number(eventStats.total),
        upcomingEvents: Number(eventStats.upcoming),
        ongoingEvents: Number(eventStats.ongoing),
        pendingTickets: Number(tStats.pending),
        totalRevenue: tStats.revenue,
        totalCheckins: Number(checkInCount.rows[0].count),
        storagePercentUsed,
      },
      upcomingEvents: resolvedUpcomingEvents,
      recentActivity: recentActivityData.rows.map((r: any) => ({
        id: r.id,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        performedByName: r.performedByName,
        performedByEmail: r.performedByEmail,
        details: null,
        ipAddress: null,
        createdAt: r.createdAt,
      })),
      myRole: {
        role_name: role.role_name,
        hierarchy_level: role.hierarchy_level,
        wing_id: role.wing_id || null,
        portfolio_id: role.portfolio_id || null,
        membership_id: role.membership_id,
      },
    });
  } catch (error) {
    console.error('Governance overview error:', error);
    return NextResponse.json({ error: 'Failed to fetch overview' }, { status: 500 });
  }
}
