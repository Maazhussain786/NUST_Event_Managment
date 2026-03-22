export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  recalculateStorageUsed,
  resolveEffectiveSocietyPrivilege,
} from '@/lib/api-utils';

/**
 * POST /api/societies/[id]/albums/[albumId]/restore
 * Restore a soft-deleted album and its photos.
 * Requires MANAGE_CONTENT privilege.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; albumId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const { id: societyId, albumId } = params;
    const ip = extractIpAddress(req);

    await client.query('BEGIN');

    // Auth
    const effectiveManageContent = await resolveEffectiveSocietyPrivilege(
      { userId: user.userId, societyId, privilegeName: 'MANAGE_CONTENT' },
      client,
    );
    if (!effectiveManageContent.allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have MANAGE_CONTENT privilege');
    }

    // Fetch deleted album
    const albumResult = await client.query(
      `SELECT id, name, deleted_at, deleted_by, photo_count
       FROM society_albums
       WHERE id = $1 AND society_id = $2 AND (is_deleted = TRUE OR deleted_at IS NOT NULL)
       FOR UPDATE`,
      [albumId, societyId]
    );
    if (albumResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Deleted album');
    }

    const album = albumResult.rows[0];

    // Restore album
    await client.query(
      `UPDATE society_albums
       SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
       WHERE id = $1 AND society_id = $2`,
      [albumId, societyId]
    );

    // Restore photos
    await client.query(
      `UPDATE society_album_photos
       SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL
       WHERE album_id = $1 AND society_id = $2 AND deleted_at IS NOT NULL`,
      [albumId, societyId]
    );

    // Recalculate storage since we're restoring photos
    await recalculateStorageUsed(societyId, client);

    await writeAuditLog(
      {
        action: 'ALBUM_RESTORED',
        performedBy: user.userId,
        societyId,
        targetType: 'album',
        targetId: albumId,
        oldValue: { deleted_at: album.deleted_at, deleted_by: album.deleted_by },
        metadata: { restoredBy: user.fullName, photoCount: album.photo_count },
        ipAddress: ip,
      },
      client
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return ApiErrors.serverError('Restore album error:', error);
  } finally {
    client.release();
  }
}
