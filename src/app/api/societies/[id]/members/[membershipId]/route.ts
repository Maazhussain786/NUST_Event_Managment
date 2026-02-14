import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// DELETE /api/societies/[id]/members/[membershipId] — remove member
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; membershipId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, membershipId } = await params;

    // Get requester role
    const myMembership = await query(
      `SELECT r.name, r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
       ORDER BY r.hierarchy_level DESC LIMIT 1`,
      [user.userId, societyId]
    );
    if (myMembership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const myLevel = user.userType === 'SUPER_ADMIN' ? 999 : myMembership.rows[0].hierarchy_level;

    // Get target membership role
    const target = await query(
      `SELECT sm.user_id, r.hierarchy_level, r.name as role_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.id = $1 AND sm.society_id = $2`,
      [membershipId, societyId]
    );
    if (target.rows.length === 0) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
    }

    // Can only remove lower-ranked members
    if (target.rows[0].hierarchy_level >= myLevel) {
      return NextResponse.json({ error: 'Cannot remove an equal or higher-ranked member' }, { status: 403 });
    }

    await query(
      'UPDATE society_memberships SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [membershipId]
    );

    // Notify removed member
    await query(
      `INSERT INTO notifications (user_id, title, body, link)
       VALUES ($1, $2, $3, $4)`,
      [
        target.rows[0].user_id,
        'Membership Removed',
        `Your ${target.rows[0].role_name} role has been removed.`,
        '/societies',
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Member remove error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
