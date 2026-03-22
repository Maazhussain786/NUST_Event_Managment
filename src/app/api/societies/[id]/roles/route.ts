export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/roles — list all roles for a society
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

    // Backfill missing system roles for legacy societies that were approved
    // before all five governance roles were consistently seeded.
    await query(
      `INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role)
       VALUES
         ($1, 'President', 'Society President — full control', 10, TRUE),
         ($1, 'Vice President', 'Wing VP', 8, TRUE),
         ($1, 'Director', 'Portfolio Director', 5, TRUE),
         ($1, 'Deputy Director', 'Deputy Portfolio Director', 3, TRUE),
         ($1, 'Member', 'General member', 1, TRUE)
       ON CONFLICT (society_id, name) DO NOTHING`,
      [societyId]
    );

    const result = await query(
      `SELECT id, name, description, hierarchy_level, is_system_role, created_at
       FROM roles
       WHERE society_id = $1
       ORDER BY hierarchy_level DESC`,
      [societyId]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Roles fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
