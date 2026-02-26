export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/security — security monitoring metrics
 *
 * Derives security intelligence from audit_logs patterns.
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
      qrScanBursts,
      rapidRegistrations,
      suspiciousActivities,
      recentSecurityEvents,
    ] = await Promise.all([
      // QR scan bursts — users scanning > 10 times in 24h
      query(`
        SELECT COUNT(*)::text AS count FROM (
          SELECT performed_by FROM audit_logs
          WHERE action = 'QR_SCANNED'
            AND created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY performed_by
          HAVING COUNT(*) > 10
        ) AS bursts
      `),

      // Rapid registrations — users registering for 5+ events in 24h
      query(`
        SELECT COUNT(*)::text AS count FROM (
          SELECT performed_by FROM audit_logs
          WHERE action = 'EVENT_REGISTERED'
            AND created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY performed_by
          HAVING COUNT(*) > 5
        ) AS rapid
      `),

      // Suspicious activities — users with high action volumes in last 24h
      query(`
        SELECT al.performed_by AS user_id,
               u.full_name AS user_name,
               u.email AS user_email,
               'HIGH_VOLUME_ACTIONS' AS indicator,
               COUNT(*) AS count,
               MAX(al.created_at) AS last_occurred
        FROM audit_logs al
        JOIN users u ON u.id = al.performed_by
        WHERE al.created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY al.performed_by, u.full_name, u.email
        HAVING COUNT(*) > 50
        ORDER BY count DESC
        LIMIT 10
      `),

      // Recent security-related events
      query(`
        SELECT al.id, al.action,
               al.performed_by,
               u.full_name AS user_name,
               u.email AS user_email,
               al.ip_address,
               al.metadata,
               al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.performed_by
        WHERE al.action IN (
          'SUPERADMIN_OVERRIDE',
          'SOCIETY_SUSPENDED',
          'MEMBER_SUSPENDED',
          'MEMBER_REMOVED',
          'PRESIDENCY_TRANSFERRED',
          'STORAGE_LIMIT_UPDATED',
          'PRIVILEGE_REVOKED',
          'QUOTA_EXCEEDED'
        )
        ORDER BY al.created_at DESC
        LIMIT 30
      `),
    ]);

    return NextResponse.json({
      failedLogins24h: 0, // Not tracked in current audit_logs schema
      qrScanBursts: parseInt(qrScanBursts.rows[0]?.count || '0'),
      rapidRegistrations: parseInt(rapidRegistrations.rows[0]?.count || '0'),
      lockingConflicts: 0,
      paymentRetrySpikes: 0,
      apiErrors24h: 0,
      suspiciousActivities: suspiciousActivities.rows,
      recentSecurityEvents: recentSecurityEvents.rows,
    });
  } catch (error) {
    console.error('Security API error:', error);
    return NextResponse.json({ error: 'Failed to fetch security metrics' }, { status: 500 });
  }
}
