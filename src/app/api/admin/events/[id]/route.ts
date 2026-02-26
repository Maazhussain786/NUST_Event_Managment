export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// PATCH /api/admin/events/[id] — approve/reject
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

    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await query(
      `UPDATE events SET status = $1, is_cancelled = $3, updated_at = NOW() WHERE id = $2`,
      [action, id, action === 'CANCELLED']
    );

    // Log the action
    await query(
      `INSERT INTO audit_logs (performed_by, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.userId, `EVENT_${action}`, 'EVENT', id, JSON.stringify({ reason: reason || '' })]
    );

    return NextResponse.json({ success: true, status: action });
  } catch (error) {
    console.error('Admin event action error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
