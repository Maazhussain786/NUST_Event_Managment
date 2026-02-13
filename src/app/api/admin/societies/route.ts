import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/admin/societies?status=PENDING
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status');

    let q = `SELECT s.id, s.name, s.description, s.logo_url, s.category,
                    s.status, s.created_at,
                    COUNT(DISTINCT sm.user_id) as member_count,
                    COUNT(DISTINCT e.id) as event_count
             FROM societies s
             LEFT JOIN society_memberships sm ON sm.society_id = s.id AND sm.status = 'ACTIVE'
             LEFT JOIN events e ON e.society_id = s.id`;

    const params: string[] = [];
    if (status) {
      q += ' WHERE s.status = $1';
      params.push(status);
    }

    q += ' GROUP BY s.id ORDER BY s.created_at DESC';

    const result = await query(q, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Admin societies error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
