import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/wings — list wings
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const result = await query(
      `SELECT w.id, w.name, w.description, w.created_at,
              u.full_name AS created_by_name,
              COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE AND sm.wing_id = w.id) AS member_count,
              (SELECT full_name FROM users u2
               JOIN society_memberships sm2 ON sm2.user_id = u2.id
               JOIN roles r ON sm2.role_id = r.id
               WHERE sm2.society_id = w.society_id AND sm2.wing_id = w.id
                 AND r.name = 'Vice President' AND sm2.is_active = TRUE
               LIMIT 1) AS vp_name
       FROM wings w
       LEFT JOIN users u ON w.created_by = u.id
       LEFT JOIN society_memberships sm ON sm.society_id = w.society_id
       WHERE w.society_id = $1 AND w.deleted_at IS NULL
       GROUP BY w.id, u.full_name
       ORDER BY w.created_at`,
      [id]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Wings fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/societies/[id]/wings — create wing (President only)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Check president
    const membership = await query(
      `SELECT r.name FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    const isPresident = membership.rows.some((r: { name: string }) => r.name === 'President');
    const isSuperAdmin = user.userType === 'SUPER_ADMIN';
    if (!isPresident && !isSuperAdmin) {
      return NextResponse.json({ error: 'Only President can create wings' }, { status: 403 });
    }

    const { name, description } = await req.json();
    if (!name) return NextResponse.json({ error: 'Wing name required' }, { status: 400 });

    const result = await query(
      `INSERT INTO wings (society_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, name, description, created_at`,
      [societyId, name, description || '', user.userId]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Wing name already exists' }, { status: 409 });
    }
    console.error('Wing create error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
