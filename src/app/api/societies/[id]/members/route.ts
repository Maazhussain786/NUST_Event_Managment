import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/members — list all members with roles
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: societyId } = await params;
    const result = await query(
      `SELECT sm.id AS membership_id, sm.user_id, sm.wing_id, sm.portfolio_id,
              sm.is_active, sm.assigned_at,
              u.full_name, u.email, u.avatar_url,
              r.name AS role_name, r.hierarchy_level,
              w.name AS wing_name,
              p.name AS portfolio_name
       FROM society_memberships sm
       JOIN users u ON sm.user_id = u.id
       JOIN roles r ON sm.role_id = r.id
       LEFT JOIN wings w ON sm.wing_id = w.id
       LEFT JOIN portfolios p ON sm.portfolio_id = p.id
       WHERE sm.society_id = $1 AND sm.is_active = TRUE
       ORDER BY r.hierarchy_level DESC, sm.assigned_at ASC`,
      [societyId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Members fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
