import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// DELETE /api/societies/[id]/wings/[wingId] — soft delete wing (President only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; wingId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, wingId } = params;

    // Check president
    const membership = await query(
      `SELECT r.name FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    const isPresident = membership.rows.some((r: { name: string }) => r.name === 'President');
    if (!isPresident && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only President can delete wings' }, { status: 403 });
    }

    await query(
      'UPDATE wings SET deleted_at = NOW() WHERE id = $1 AND society_id = $2',
      [wingId, societyId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wing delete error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// GET /api/societies/[id]/wings/[wingId] — get wing details with portfolios
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; wingId: string } }
) {
  try {
    const { id: societyId, wingId } = params;

    const wing = await query(
      `SELECT w.id, w.name, w.description, w.created_at
       FROM wings w WHERE w.id = $1 AND w.society_id = $2 AND w.deleted_at IS NULL`,
      [wingId, societyId]
    );
    if (wing.rows.length === 0) {
      return NextResponse.json({ error: 'Wing not found' }, { status: 404 });
    }

    const portfolios = await query(
      `SELECT p.id, p.name, p.description, p.created_at
       FROM portfolios p WHERE p.wing_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.created_at`,
      [wingId]
    );

    return NextResponse.json({ ...wing.rows[0], portfolios: portfolios.rows });
  } catch (error) {
    console.error('Wing detail error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
