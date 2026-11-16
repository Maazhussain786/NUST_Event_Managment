export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { getEventAccess, can, forbidden } from '@/lib/rbac';

/**
 * POST /api/events/[id]/archive { archived: boolean }  (FR-EVT-01)
 * Archived events become read-only workspaces; their records stay for audit (SRS 2.5).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getEventAccess(user, params.id);
    if (!access || access.event.deleted_at) return ApiErrors.notFound('Event');
    if (!can(access.society, 'CANCEL_EVENT')) return forbidden('Only Admins can archive events.');

    const { archived } = await req.json().catch(() => ({}));
    if (typeof archived !== 'boolean') return ApiErrors.validation('archived must be true or false');

    if (archived) {
      await query(
        `UPDATE events SET archived_at = NOW(), archived_by = $2, status = 'ARCHIVED', updated_at = NOW()
         WHERE id = $1 AND archived_at IS NULL`,
        [params.id, user.userId],
      );
    } else {
      // status NULL lets the status trigger recompute UPCOMING / ONGOING / COMPLETED from dates.
      await query(
        `UPDATE events SET archived_at = NULL, archived_by = NULL, status = NULL, updated_at = NOW()
         WHERE id = $1 AND archived_at IS NOT NULL`,
        [params.id],
      );
    }
    await writeAuditLog({
      action: archived ? 'EVENT_ARCHIVED' : 'EVENT_UNARCHIVED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'event',
      targetId: params.id,
    });
    return NextResponse.json({ success: true, archived });
  } catch (error) {
    return ApiErrors.serverError('Archive event error:', error);
  }
}
