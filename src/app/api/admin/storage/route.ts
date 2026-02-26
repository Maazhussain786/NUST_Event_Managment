export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/storage
 *
 * Per-society storage usage breakdown for SuperAdmin.
 * Returns all societies with their storage metrics from v_society_storage_usage.
 *
 * Query params:
 *   ?sort=percent_used|storage_used_bytes|society_name  (default: percent_used DESC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sort = req.nextUrl.searchParams.get('sort') || 'percent_used';
    const validSorts = ['percent_used', 'storage_used_bytes', 'society_name', 'storage_quota_bytes'];
    const orderCol = validSorts.includes(sort) ? sort : 'percent_used';
    const orderDir = orderCol === 'society_name' ? 'ASC' : 'DESC';

    const result = await query(
      `SELECT * FROM v_society_storage_usage ORDER BY ${orderCol} ${orderDir}`
    );

    // Aggregate
    const aggregate = await query(`
      SELECT
        COUNT(*) AS total_societies,
        SUM(storage_used_bytes)::BIGINT AS total_used,
        SUM(storage_quota_bytes)::BIGINT AS total_quota,
        COUNT(CASE WHEN percent_used > 80 THEN 1 END) AS near_limit_count,
        COUNT(CASE WHEN percent_used > 95 THEN 1 END) AS critical_count
      FROM v_society_storage_usage
    `);

    return NextResponse.json({
      societies: result.rows,
      aggregate: aggregate.rows[0],
    });
  } catch (error) {
    console.error('Storage overview error:', error);
    return NextResponse.json({ error: 'Failed to fetch storage data' }, { status: 500 });
  }
}
