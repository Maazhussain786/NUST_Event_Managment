export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/university-events/[id] — update pin/lock/priority/status
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
    const body = await req.json();

    // Update university-specific fields
    if (body.is_pinned !== undefined || body.is_locked !== undefined || body.priority_rank !== undefined) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 0;

      if (body.is_pinned !== undefined) {
        idx++;
        sets.push(`is_pinned = $${idx}`);
        vals.push(body.is_pinned);
      }
      if (body.is_locked !== undefined) {
        idx++;
        sets.push(`is_locked = $${idx}`);
        vals.push(body.is_locked);
      }
      if (body.priority_rank !== undefined) {
        idx++;
        sets.push(`priority_rank = $${idx}`);
        vals.push(body.priority_rank);
      }

      sets.push('updated_at = NOW()');
      idx++;
      vals.push(id);

      await query(
        `UPDATE platform_university_events SET ${sets.join(', ')} WHERE event_id = $${idx}`,
        vals
      );
    }

    // Update event status if provided
    if (body.status) {
      const validStatuses = ['APPROVED', 'CANCELLED', 'PENDING'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      await query(
        'UPDATE events SET status = $1, is_cancelled = $3, updated_at = NOW() WHERE id = $2',
        [body.status, id, body.status === 'CANCELLED']
      );
    }

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'EVENT', $2, $3, $4)`,
      [
        user.userId,
        id,
        JSON.stringify(body),
        JSON.stringify({ updatedBy: user.email, type: 'UNIVERSITY_EVENT_UPDATE' }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update university event error:', error);
    return NextResponse.json({ error: 'Failed to update university event' }, { status: 500 });
  }
}
