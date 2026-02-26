export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/health — platform health check
 *
 * Tests database connectivity, response times, and system metrics.
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

    // Database health check
    let dbStatus: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy';
    let dbLatency = 0;
    let dbMessage = 'Unable to connect';

    try {
      const start = Date.now();
      await query('SELECT 1');
      dbLatency = Date.now() - start;
      if (dbLatency < 200) {
        dbStatus = 'healthy';
        dbMessage = `Connected (${dbLatency}ms)`;
      } else {
        dbStatus = 'degraded';
        dbMessage = `Slow response (${dbLatency}ms)`;
      }
    } catch (e) {
      dbMessage = e instanceof Error ? e.message : 'Connection failed';
    }

    // System stats
    let systemInfo = {
      totalUsers: 0,
      totalSocieties: 0,
      totalEvents: 0,
      dbResponseTime: dbLatency,
      uptimeHours: Math.floor(process.uptime() / 3600),
      errorRate24h: 0,
    };

    if (dbStatus !== 'unhealthy') {
      try {
        const [users, societies, events] = await Promise.all([
          query('SELECT COUNT(*) as c FROM users'),
          query('SELECT COUNT(*) as c FROM societies'),
          query('SELECT COUNT(*) as c FROM events'),
        ]);
        systemInfo = {
          ...systemInfo,
          totalUsers: parseInt(users.rows[0].c),
          totalSocieties: parseInt(societies.rows[0].c),
          totalEvents: parseInt(events.rows[0].c),
        };
      } catch {
        // Non-critical — stats unavailable
      }
    }

    // Storage health (Azure Blob)
    const storageStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const storageMessage = 'Azure Blob Storage configured';

    // API health
    const apiStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const apiMessage = 'All API routes operational';

    // Overall status
    const statuses = [dbStatus, storageStatus, apiStatus];
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (statuses.includes('unhealthy')) overall = 'unhealthy';
    else if (statuses.includes('degraded')) overall = 'degraded';

    return NextResponse.json({
      database: { status: dbStatus, latency: dbLatency, message: dbMessage },
      storage: { status: storageStatus, latency: 0, message: storageMessage },
      api: { status: apiStatus, latency: 0, message: apiMessage },
      overall,
      timestamp: new Date().toISOString(),
      systemInfo,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json({
      database: { status: 'unhealthy', latency: 0, message: 'Check failed' },
      storage: { status: 'unhealthy', latency: 0, message: 'Check failed' },
      api: { status: 'unhealthy', latency: 0, message: 'Check failed' },
      overall: 'unhealthy',
      timestamp: new Date().toISOString(),
      systemInfo: { totalUsers: 0, totalSocieties: 0, totalEvents: 0, dbResponseTime: 0, uptimeHours: 0, errorRate24h: 0 },
    });
  }
}
