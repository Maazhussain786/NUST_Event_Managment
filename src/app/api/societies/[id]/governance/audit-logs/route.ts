export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/audit-logs — paginated audit logs
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Verify membership with hierarchy >= 5 (Director+) or VIEW_AUDIT_LOGS privilege
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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const action = searchParams.get('action');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) AS total FROM audit_logs WHERE society_id = $1`;
    let dataSql = `
      SELECT al.id, al.action, al.target_type, al.target_id,
             al.old_value, al.new_value, al.metadata,
             al.ip_address, al.created_at,
             u.full_name AS performed_by_name, u.email AS performed_by_email
      FROM audit_logs al
      LEFT JOIN users u ON al.performed_by = u.id
      WHERE al.society_id = $1
    `;
    const qParams: unknown[] = [societyId];
    const countParams: unknown[] = [societyId];

    if (action) {
      qParams.push(action);
      countParams.push(action);
      dataSql += ` AND al.action = $${qParams.length}`;
      countSql += ` AND action = $${countParams.length}`;
    }

    if (from) {
      qParams.push(from);
      countParams.push(from);
      dataSql += ` AND al.created_at >= $${qParams.length}::timestamptz`;
      countSql += ` AND created_at >= $${countParams.length}::timestamptz`;
    }

    if (to) {
      qParams.push(to);
      countParams.push(to);
      dataSql += ` AND al.created_at <= $${qParams.length}::timestamptz`;
      countSql += ` AND created_at <= $${countParams.length}::timestamptz`;
    }

    dataSql += ` ORDER BY al.created_at DESC LIMIT $${qParams.length + 1} OFFSET $${qParams.length + 2}`;
    qParams.push(limit, offset);

    const [countResult, dataResult] = await Promise.all([
      query(countSql, countParams),
      query(dataSql, qParams),
    ]);

    const total = parseInt(countResult.rows[0].total);

    // Format logs
    const logs = dataResult.rows.map((row: any) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: formatDetails(row),
      performedByName: row.performed_by_name,
      performedByEmail: row.performed_by_email,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ logs, total, page, limit });
  } catch (error) {
    console.error('Audit logs error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

function formatDetails(row: any): string {
  const parts: string[] = [];

  if (row.metadata) {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    if (meta.eventTitle) parts.push(`Event: ${meta.eventTitle}`);
    if (meta.roleName) parts.push(`Role: ${meta.roleName}`);
    if (meta.reviewedBy) parts.push(`by ${meta.reviewedBy}`);
    if (meta.reason) parts.push(`Reason: ${meta.reason}`);
  }

  if (row.new_value) {
    const nv = typeof row.new_value === 'string' ? JSON.parse(row.new_value) : row.new_value;
    if (nv.title) parts.push(`"${nv.title}"`);
    if (nv.action) parts.push(nv.action);
  }

  return parts.join(' • ') || row.target_type || '';
}
