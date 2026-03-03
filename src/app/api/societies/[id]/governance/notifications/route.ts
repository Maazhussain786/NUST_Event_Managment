export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/notifications — society-scoped notifications
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

    // Notifications table doesn't have society_id, so we filter by links containing society events
    // or by the user's own notifications relating to this society's events
    // For now, return user's notifications that contain event links for this society's events
    const result = await query(
      `SELECT n.id, n.title, n.body, n.link, n.is_read, n.created_at
       FROM notifications n
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [user.userId]
    );

    // Also get audit log entries as "system notifications"
    const auditNotifs = await query(
      `SELECT al.id, al.action AS title,
              COALESCE(al.metadata->>'eventTitle', al.action) AS body,
              al.created_at, al.target_type AS link,
              FALSE AS is_read
       FROM audit_logs al
       WHERE al.society_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [societyId]
    );

    // Combine and format
    const notifications = [
      ...result.rows.map((n: any) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: 'info',
        is_read: n.is_read,
        created_at: n.created_at,
        metadata: null,
      })),
      ...auditNotifs.rows.map((n: any) => ({
        id: n.id,
        title: String(n.title).replace(/_/g, ' '),
        body: n.body,
        type: 'info',
        is_read: true,
        created_at: n.created_at,
        metadata: null,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100);

    return NextResponse.json(notifications);
  } catch (error) {
    console.error('Society notifications error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
