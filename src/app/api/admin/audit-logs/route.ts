/**
 * GET /api/admin/audit-logs
 *
 * Paginated, filterable audit log viewer for SuperAdmin.
 *
 * Query params:
 *   ?page=1&limit=50
 *   &action=SOCIETY_APPROVED (filter by audit_action_enum)
 *   &userId=uuid (filter by performed_by)
 *   &societyId=uuid (filter by society_id)
 *   &from=2026-01-01 (ISO date)
 *   &to=2026-12-31 (ISO date)
 *   &search=keyword (search target_type, metadata)
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

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const action = sp.get('action');
    const userId = sp.get('userId');
    const societyId = sp.get('societyId');
    const from = sp.get('from');
    const to = sp.get('to');

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 0;

    if (action) {
      paramIdx++;
      conditions.push(`al.action = $${paramIdx}::audit_action_enum`);
      params.push(action);
    }
    if (userId) {
      paramIdx++;
      conditions.push(`al.performed_by = $${paramIdx}`);
      params.push(userId);
    }
    if (societyId) {
      paramIdx++;
      conditions.push(`al.society_id = $${paramIdx}`);
      params.push(societyId);
    }
    if (from) {
      paramIdx++;
      conditions.push(`al.created_at >= $${paramIdx}::timestamptz`);
      params.push(from);
    }
    if (to) {
      paramIdx++;
      conditions.push(`al.created_at <= ($${paramIdx}::date + INTERVAL '1 day')::timestamptz`);
      params.push(to);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // ─── CSV Export ──────────────────────────────────────────────────────
    const format = sp.get('format');
    if (format === 'csv') {
      const csvResult = await query(
        `SELECT al.id, al.action, al.performed_by,
                u.full_name AS performed_by_name,
                u.email AS performed_by_email,
                al.society_id, s.name AS society_name,
                al.target_type, al.target_id,
                al.ip_address, al.created_at
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.performed_by
         LEFT JOIN societies s ON s.id = al.society_id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT 5000`,
        params
      );

      const headers = ['ID', 'Action', 'Performed By', 'Name', 'Email', 'Society', 'Target Type', 'Target ID', 'IP Address', 'Timestamp'];
      const csvRows = csvResult.rows.map((r: Record<string, unknown>) =>
        [r.id, r.action, r.performed_by, r.performed_by_name || '', r.performed_by_email || '', r.society_name || '', r.target_type || '', r.target_id || '', r.ip_address || '', r.created_at]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
      const csv = [headers.join(','), ...csvRows].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // ─── JSON (paginated) ───────────────────────────────────────────────
    // Count total
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM audit_logs al ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch page
    paramIdx++;
    const limitParam = paramIdx;
    paramIdx++;
    const offsetParam = paramIdx;

    const result = await query(
      `SELECT al.id, al.action, al.performed_by, al.society_id,
              al.target_type, al.target_id,
              al.old_value, al.new_value, al.metadata,
              al.ip_address, al.created_at,
              u.full_name AS performed_by_name,
              u.email AS performed_by_email,
              s.name AS society_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.performed_by
       LEFT JOIN societies s ON s.id = al.society_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      logs: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Audit logs query error:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
