/**
 * POST /api/admin/users/[id]/suspend — suspend a user account
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { reason } = await req.json();

    // Cannot suspend yourself
    if (id === user.userId) {
      return NextResponse.json({ error: 'Cannot suspend your own account' }, { status: 400 });
    }

    // Check target exists
    const target = await query('SELECT id, status, user_type, full_name FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (target.rows[0].status === 'SUSPENDED') {
      return NextResponse.json({ error: 'User is already suspended' }, { status: 400 });
    }

    await query('UPDATE users SET status = $1 WHERE id = $2', ['SUSPENDED', id]);

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, old_value, new_value, metadata)
       VALUES ('MEMBER_SUSPENDED', $1, 'USER', $2, $3, $4, $5)`,
      [
        user.userId,
        id,
        JSON.stringify({ status: target.rows[0].status }),
        JSON.stringify({ status: 'SUSPENDED' }),
        JSON.stringify({ reason: reason || '', targetName: target.rows[0].full_name }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin user suspend error:', error);
    return NextResponse.json({ error: 'Failed to suspend user' }, { status: 500 });
  }
}
