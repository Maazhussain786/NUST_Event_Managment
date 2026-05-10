export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTAINERS, resolveMediaFields } from '@/lib/blob';

// GET /api/societies/[id]/members — list all members with roles
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: societyId } = params;

    // Verify requester is a member or SUPER_ADMIN
    if (user.userType !== 'SUPER_ADMIN') {
      const membership = await query(
        `SELECT 1 FROM society_memberships
         WHERE society_id = $1 AND user_id = $2 AND is_active = TRUE`,
        [societyId, user.userId]
      );
      if (membership.rows.length === 0) {
        return NextResponse.json({ error: 'Not a member of this society' }, { status: 403 });
      }
    }

    const result = await query(
      `WITH ranked_members AS (
         SELECT sm.id AS membership_id, sm.user_id, sm.wing_id, sm.portfolio_id,
                sm.is_active, sm.assigned_at,
                u.full_name, u.email, u.avatar_url,
                r.name AS role_name, r.hierarchy_level,
                w.name AS wing_name,
                p.name AS portfolio_name,
                ROW_NUMBER() OVER (
                  PARTITION BY sm.user_id
                  ORDER BY r.hierarchy_level DESC, sm.assigned_at DESC
                ) AS rn
         FROM society_memberships sm
         JOIN users u ON sm.user_id = u.id
         JOIN roles r ON sm.role_id = r.id
         LEFT JOIN wings w ON sm.wing_id = w.id
         LEFT JOIN portfolios p ON sm.portfolio_id = p.id
         WHERE sm.society_id = $1
           AND sm.is_active = TRUE
           AND u.status IS DISTINCT FROM 'SUSPENDED'
       )
       SELECT membership_id, user_id, wing_id, portfolio_id,
              is_active, assigned_at, full_name, email, avatar_url,
              role_name, hierarchy_level, wing_name, portfolio_name
       FROM ranked_members
       WHERE rn = 1
       ORDER BY hierarchy_level DESC, assigned_at ASC`,
      [societyId]
    );
    const members = result.rows.map((member) =>
      resolveMediaFields(member, {
        avatar_url: CONTAINERS.PROFILE_PICTURES,
      }),
    );

    return NextResponse.json(members);
  } catch (error) {
    console.error('Members fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
