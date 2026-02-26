export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/administrators — list all SUPER_ADMIN users with action counts
 * POST /api/admin/administrators — promote a STUDENT to SUPER_ADMIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await query(`
      SELECT u.id, u.email, u.full_name, u.status, u.created_at,
             COUNT(al.id) AS action_count,
             MAX(al.created_at) AS last_action_at
      FROM users u
      LEFT JOIN audit_logs al ON al.performed_by = u.id
      WHERE u.user_type = 'SUPER_ADMIN'
      GROUP BY u.id
      ORDER BY u.created_at ASC
    `);

    return NextResponse.json({
      administrators: result.rows,
      totalCount: result.rows.length,
    });
  } catch (error) {
    console.error('Admin administrators error:', error);
    return NextResponse.json({ error: 'Failed to fetch administrators' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Check target user exists and is STUDENT
    const target = await query('SELECT id, user_type, full_name FROM users WHERE id = $1', [userId]);
    if (target.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (target.rows[0].user_type === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'User is already an administrator' }, { status: 400 });
    }

    await query('UPDATE users SET user_type = $1 WHERE id = $2', ['SUPER_ADMIN', userId]);

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'USER', $2, $3, $4)`,
      [
        user.userId,
        userId,
        JSON.stringify({ user_type: 'SUPER_ADMIN' }),
        JSON.stringify({ promotedBy: user.email, targetName: target.rows[0].full_name }),
      ]
    );

    return NextResponse.json({ success: true, message: 'User promoted to administrator' });
  } catch (error) {
    console.error('Admin promote error:', error);
    return NextResponse.json({ error: 'Failed to promote user' }, { status: 500 });
  }
}
