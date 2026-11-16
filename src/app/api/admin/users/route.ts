export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/admin/users
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.user_type, u.status, u.created_at, u.designation,
              COUNT(DISTINCT sm.society_id) as society_count
       FROM users u
       LEFT JOIN society_memberships sm ON sm.user_id = u.id AND sm.is_active = TRUE
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 500`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
