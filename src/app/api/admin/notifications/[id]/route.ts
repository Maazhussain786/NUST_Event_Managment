export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admin/notifications/[id] — deactivate/delete a notification
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    await query(
      'UPDATE platform_notifications SET is_active = false WHERE id = $1',
      [id]
    );

    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'NOTIFICATION', $2, $3)`,
      [
        user.userId,
        id,
        JSON.stringify({ action: 'DEACTIVATED', deactivatedBy: user.email }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
}
