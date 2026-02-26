export const dynamic = 'force-dynamic';

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
      users,
      societies,
      events,
      pendingEvents,
      pendingSocieties,
      activeEvents,
      revenueToday,
      storageAgg,
      qrScansToday,
      suspensionsToday,
    ] = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM societies WHERE status = $1', ['APPROVED']),
      query('SELECT COUNT(*) as count FROM events'),
      query('SELECT COUNT(*) as count FROM events WHERE status = $1', ['PENDING']),
      query('SELECT COUNT(*) as count FROM societies WHERE status = $1', ['PENDING']),
      query(`SELECT COUNT(*) as count FROM events
             WHERE status = 'APPROVED'
               AND event_start <= NOW()
               AND event_end >= NOW()`),
      query(`SELECT COALESCE(SUM(e.ticket_price), 0) as total
             FROM tickets t
             JOIN events e ON e.id = t.event_id
             WHERE t.status = 'APPROVED'
               AND t.purchased_at >= CURRENT_DATE`),
      query(`SELECT COALESCE(SUM(storage_used_bytes), 0) as used,
                    COALESCE(SUM(storage_quota_bytes), 0) as quota
             FROM v_society_storage_usage`),
      query(`SELECT COUNT(*) as count FROM audit_logs
             WHERE action = 'QR_SCANNED'
               AND created_at >= CURRENT_DATE`),
      query(`SELECT COUNT(*) as count FROM audit_logs
             WHERE action IN ('SOCIETY_SUSPENDED', 'MEMBER_SUSPENDED')
               AND created_at >= CURRENT_DATE`),
    ]);

    return NextResponse.json({
      totalUsers: parseInt(users.rows[0].count),
      totalSocieties: parseInt(societies.rows[0].count),
      totalEvents: parseInt(events.rows[0].count),
      pendingEvents: parseInt(pendingEvents.rows[0].count),
      pendingSocieties: parseInt(pendingSocieties.rows[0].count),
      activeEvents: parseInt(activeEvents.rows[0].count),
      revenueToday: revenueToday.rows[0].total?.toString() || '0',
      globalStorageUsed: storageAgg.rows[0].used?.toString() || '0',
      globalStorageQuota: storageAgg.rows[0].quota?.toString() || '0',
      qrScansToday: parseInt(qrScansToday.rows[0].count),
      suspensionsToday: parseInt(suspensionsToday.rows[0].count),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
