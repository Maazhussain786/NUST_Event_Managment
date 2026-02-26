export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/cohost-requests/[id] — approve or reject a co-host request
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

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
    const { action, admin_note } = await req.json();

    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return NextResponse.json({ error: 'action must be APPROVED or REJECTED' }, { status: 400 });
    }

    await query(
      `UPDATE platform_cohost_requests
       SET status = $1, admin_note = $2, approved_by = $3, updated_at = NOW()
       WHERE id = $4`,
      [action, admin_note || null, user.userId, id]
    );

    // Get request details for audit
    const reqDetail = await query(
      `SELECT cr.event_id, e.title, rs.name AS requesting, hs.name AS host
       FROM platform_cohost_requests cr
       JOIN events e ON e.id = cr.event_id
       JOIN societies rs ON rs.id = cr.requesting_society_id
       JOIN societies hs ON hs.id = cr.host_society_id
       WHERE cr.id = $1`,
      [id]
    );

    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'COHOST_REQUEST', $2, $3, $4)`,
      [
        user.userId,
        id,
        JSON.stringify({ status: action }),
        JSON.stringify({
          decision: action,
          admin_note: admin_note || '',
          event: reqDetail.rows[0]?.title || '',
          decidedBy: user.email,
        }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Co-host request update error:', error);
    return NextResponse.json({ error: 'Failed to update co-host request' }, { status: 500 });
  }
}
