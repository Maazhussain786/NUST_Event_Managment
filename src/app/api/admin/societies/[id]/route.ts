import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// PATCH /api/admin/societies/[id] — approve/reject/suspend
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { action, reason } = await req.json();

    if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Get current status for logging
    const current = await query('SELECT status FROM societies WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }

    await query(
      'UPDATE societies SET status = $1, updated_at = NOW() WHERE id = $2',
      [action, id]
    );

    // Log state change
    try {
      await query(
        `SELECT fn_log_society_state_change($1, $2, $3, $4, $5)`,
        [id, current.rows[0].status, action, user.userId, reason || '']
      );
    } catch {
      // Function may not exist, log to audit_logs instead
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.userId, `SOCIETY_${action}`, 'SOCIETY', id, JSON.stringify({ from: current.rows[0].status, reason: reason || '' })]
      );
    }

    return NextResponse.json({ success: true, status: action });
  } catch (error) {
    console.error('Admin society action error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
