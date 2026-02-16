import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/wings/[wingId]/portfolios
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; wingId: string } }
) {
  try {
    const { wingId } = params;
    const result = await query(
      `SELECT p.id, p.name, p.description, p.created_at,
              u.full_name AS created_by_name,
              COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE AND sm.portfolio_id = p.id) AS member_count,
              (SELECT full_name FROM users u2
               JOIN society_memberships sm2 ON sm2.user_id = u2.id
               JOIN roles r ON sm2.role_id = r.id
               WHERE sm2.portfolio_id = p.id AND r.name = 'Director' AND sm2.is_active = TRUE
               LIMIT 1) AS director_name
       FROM portfolios p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN society_memberships sm ON sm.portfolio_id = p.id
       WHERE p.wing_id = $1 AND p.deleted_at IS NULL
       GROUP BY p.id, u.full_name
       ORDER BY p.created_at`,
      [wingId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Portfolios fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/societies/[id]/wings/[wingId]/portfolios — create portfolio (President/VP)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; wingId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, wingId } = params;

    // Check president or VP of this wing
    const membership = await query(
      `SELECT r.name, sm.wing_id FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    const isPresident = membership.rows.some((r: { name: string }) => r.name === 'President');
    const isWingVP = membership.rows.some(
      (r: { name: string; wing_id: string }) => r.name === 'Vice President' && r.wing_id === wingId
    );
    if (!isPresident && !isWingVP && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only President or Wing VP can create portfolios' }, { status: 403 });
    }

    const { name, description } = await req.json();
    if (!name) return NextResponse.json({ error: 'Portfolio name required' }, { status: 400 });

    const result = await query(
      `INSERT INTO portfolios (wing_id, society_id, name, description, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, created_at`,
      [wingId, societyId, name, description || '', user.userId]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Portfolio name already exists in this wing' }, { status: 409 });
    }
    console.error('Portfolio create error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
