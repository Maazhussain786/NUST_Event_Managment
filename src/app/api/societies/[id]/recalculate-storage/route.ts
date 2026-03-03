export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  recalculateStorageUsed,
} from '@/lib/api-utils';

/**
 * POST /api/societies/[id]/recalculate-storage
 * Recalculate storage_used_bytes from all media tables.
 * Requires MANAGE_STORAGE privilege or SUPER_ADMIN.
 * Used for recovery after storage drift.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    if (user.userType !== 'SUPER_ADMIN') {
      return ApiErrors.forbidden('Only platform administrators can recalculate storage');
    }

    const { id: societyId } = params;
    const ip = extractIpAddress(req);

    const result = await recalculateStorageUsed(societyId);

    await writeAuditLog({
      action: 'STORAGE_ROLLBACK',
      performedBy: user.userId,
      societyId,
      targetType: 'society',
      targetId: societyId,
      newValue: { recalculatedBytes: result },
      metadata: { triggeredBy: user.fullName },
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, storageUsedBytes: result });
  } catch (error) {
    return ApiErrors.serverError('Recalculate storage error:', error);
  }
}
