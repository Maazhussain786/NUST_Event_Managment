import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * POST /api/admin/societies/[id]/suspend
 *
 * SuperAdmin suspends (deactivates) a society.
 * Auth: SUPER_ADMIN only.
 * Body: { reason: string }
 *
 * Sets societies.status = 'DEACTIVATED', logs the state change.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden — SuperAdmin only' }, { status: 403 });
    }

    const { id: societyId } = params;
    const body = await req.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason is required for society suspension' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. Verify society exists
    const society = await client.query(
      `SELECT id, name, status FROM societies WHERE id = $1`,
      [societyId]
    );
    if (society.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }

    const fromStatus = society.rows[0].status;
    if (fromStatus === 'DEACTIVATED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society is already deactivated' }, { status: 409 });
    }

    // 2. Set status to DEACTIVATED
    await client.query(
      `UPDATE societies SET status = 'DEACTIVATED', updated_at = NOW() WHERE id = $1`,
      [societyId]
    );

    // 3. Log state change
    await client.query(
      `INSERT INTO society_state_changes (society_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'DEACTIVATED', $3, $4)`,
      [societyId, fromStatus, user.userId, reason.trim()]
    );

    // 4. Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('SOCIETY_SUSPENDED', $1, $2, 'society', $3, $4, $5, $6)`,
      [
        user.userId,
        societyId,
        societyId,
        JSON.stringify({ status: fromStatus }),
        JSON.stringify({ status: 'DEACTIVATED' }),
        JSON.stringify({
          societyName: society.rows[0].name,
          reason: reason.trim(),
          suspendedBy: user.fullName,
        }),
      ]
    );

    // 5. Notify President (if any)
    const president = await client.query(
      `SELECT sm.user_id FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.society_id = $1 AND r.name = 'President' AND sm.is_active = TRUE
       LIMIT 1`,
      [societyId]
    );
    if (president.rows.length > 0) {
      await client.query(
        `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
        [
          president.rows[0].user_id,
          'Society Suspended ⚠️',
          `${society.rows[0].name} has been suspended by administration. Reason: ${reason.trim()}`,
          `/society-dashboard/${societyId}`,
        ]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Society "${society.rows[0].name}" has been suspended`,
      previousStatus: fromStatus,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Society suspend error:', error);
    return NextResponse.json({ error: 'Failed to suspend society' }, { status: 500 });
  } finally {
    client.release();
  }
}
