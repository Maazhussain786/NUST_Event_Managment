export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/my-role
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    if (user.userType === 'SUPER_ADMIN') {
      return NextResponse.json({
        role: {
          membership_id: 'super-admin',
          role_name: 'President',
          hierarchy_level: 10,
          wing_id: null,
          wing_name: null,
          portfolio_id: null,
          portfolio_name: null,
        }
      });
    }

    const result = await query(
      `SELECT sm.id AS membership_id, r.name AS role_name, r.hierarchy_level,
              sm.wing_id, w.name AS wing_name,
              sm.portfolio_id, p.name AS portfolio_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       LEFT JOIN wings w ON sm.wing_id = w.id
       LEFT JOIN portfolios p ON sm.portfolio_id = p.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
       ORDER BY r.hierarchy_level DESC
       LIMIT 1`,
      [user.userId, societyId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ role: null });
    }

    const row = result.rows[0];
    return NextResponse.json({
      role: {
        membership_id: row.membership_id,
        role_name: row.role_name,
        hierarchy_level: row.hierarchy_level,
        wing_id: row.wing_id,
        wing_name: row.wing_name,
        portfolio_id: row.portfolio_id,
        portfolio_name: row.portfolio_name,
      }
    });
  } catch (error) {
    console.error('My role error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
