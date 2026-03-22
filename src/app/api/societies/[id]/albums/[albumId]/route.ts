export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTAINERS, extractBlobName, generateReadUrl } from '@/lib/blob';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  checkSocietyOperational,
  decrementStorageUsed,
  resolveEffectiveSocietyPrivilege,
} from '@/lib/api-utils';

function signMediaUrl(url: string | null | undefined): string | null | undefined {
  if (!url) return url;

  const candidates = [
    CONTAINERS.SOCIETY_MEDIA,
    CONTAINERS.EVENT_MEDIA,
    CONTAINERS.POST_ATTACHMENTS,
    CONTAINERS.NOTE_ATTACHMENTS,
    CONTAINERS.PROFILE_PICTURES,
  ];

  for (const container of candidates) {
    const blobName = extractBlobName(url, container);
    if (blobName) {
      return generateReadUrl(container, blobName, 24 * 60);
    }
  }

  return url;
}

/**
 * GET /api/societies/[id]/albums/[albumId]
 * Get album details with photos.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; albumId: string } }
) {
  try {
    const { id: societyId, albumId } = params;

    const albumResult = await query(
      `SELECT a.id, a.name, a.description, a.category, a.photo_count,
              a.created_at, a.updated_at,
              u.full_name AS created_by_name
       FROM society_albums a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = $1 AND a.society_id = $2 AND a.is_deleted = FALSE AND a.deleted_at IS NULL`,
      [albumId, societyId]
    );

    if (albumResult.rows.length === 0) {
      return ApiErrors.notFound('Album');
    }

    const photosResult = await query(
      `SELECT p.id, p.file_url, p.file_name, p.file_size_bytes, p.mime_type,
              p.caption, p.is_featured, p.display_order, p.created_at,
              u.full_name AS uploaded_by_name
       FROM society_album_photos p
       LEFT JOIN users u ON p.uploaded_by = u.id
       WHERE p.album_id = $1 AND p.society_id = $2 AND p.is_deleted = FALSE AND p.deleted_at IS NULL
       ORDER BY p.display_order, p.created_at DESC`,
      [albumId, societyId]
    );

    const photos = photosResult.rows.map((row) => ({
      ...row,
      file_url: signMediaUrl(row.file_url),
    }));

    return NextResponse.json({
      album: albumResult.rows[0],
      photos,
    });
  } catch (error) {
    return ApiErrors.serverError('Fetch album details error:', error);
  }
}

/**
 * PATCH /api/societies/[id]/albums/[albumId]
 * Update album name, description, category.
 * Uses FOR UPDATE lock and version increment.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; albumId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const { id: societyId, albumId } = params;
    const body = await req.json();
    const ip = extractIpAddress(req);

    await client.query('BEGIN');

    // Society operational check
    const societyCheck = await checkSocietyOperational(societyId, client);
    if (societyCheck) { await client.query('ROLLBACK'); return societyCheck; }

      const effectiveManageContent = await resolveEffectiveSocietyPrivilege(
        { userId: user.userId, societyId, privilegeName: 'MANAGE_CONTENT' },
        client,
      );
      if (!effectiveManageContent.allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have MANAGE_CONTENT privilege');
    }

    // Fetch album with FOR UPDATE
    const existing = await client.query(
      `SELECT id, name, description, category, cover_photo_id, version
       FROM society_albums
       WHERE id = $1 AND society_id = $2 AND is_deleted = FALSE AND deleted_at IS NULL
       FOR UPDATE`,
      [albumId, societyId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Album');
    }

    const oldAlbum = existing.rows[0];

    const sets: string[] = [];
    const vals: any[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    let idx = 1;

    if (body.name !== undefined) {
      oldValues.name = oldAlbum.name;
      newValues.name = body.name.trim();
      sets.push(`name = $${idx++}`);
      vals.push(body.name.trim());
    }
    if (body.description !== undefined) {
      oldValues.description = oldAlbum.description;
      newValues.description = body.description?.trim() || null;
      sets.push(`description = $${idx++}`);
      vals.push(body.description?.trim() || null);
    }
    if (body.category !== undefined) {
      oldValues.category = oldAlbum.category;
      newValues.category = body.category;
      sets.push(`category = $${idx++}`);
      vals.push(body.category);
    }
    if (body.cover_photo_id !== undefined) {
      oldValues.cover_photo_id = oldAlbum.cover_photo_id;
      newValues.cover_photo_id = body.cover_photo_id;
      sets.push(`cover_photo_id = $${idx++}`);
      vals.push(body.cover_photo_id);
    }

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.validation('No fields to update');
    }

    sets.push(`updated_at = NOW()`);
    sets.push(`version = COALESCE(version, 1) + 1`);
    vals.push(albumId, societyId);

    const result = await client.query(
      `UPDATE society_albums SET ${sets.join(', ')} WHERE id = $${idx++} AND society_id = $${idx} AND is_deleted = FALSE RETURNING id`,
      vals
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Album');
    }

    await writeAuditLog(
      {
        action: 'ALBUM_UPDATED',
        performedBy: user.userId,
        societyId,
        targetType: 'album',
        targetId: albumId,
        oldValue: oldValues,
        newValue: newValues,
        metadata: { updatedBy: user.fullName },
        ipAddress: ip,
      },
      client
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return ApiErrors.serverError('Update album error:', error);
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/societies/[id]/albums/[albumId]
 * Soft-delete an album with deleted_at timestamp.
 * Cascade soft-deletes photos and decrements storage.
 */
export async function DELETE(
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

    // Society operational check
    const societyCheck = await checkSocietyOperational(societyId, client);
    if (societyCheck) { await client.query('ROLLBACK'); return societyCheck; }

      const effectiveManageContent = await resolveEffectiveSocietyPrivilege(
        { userId: user.userId, societyId, privilegeName: 'MANAGE_CONTENT' },
        client,
      );
      if (!effectiveManageContent.allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have MANAGE_CONTENT privilege');
    }

    // Fetch album for audit + lock
    const existing = await client.query(
      `SELECT id, name, description, category, photo_count
       FROM society_albums
       WHERE id = $1 AND society_id = $2 AND is_deleted = FALSE AND deleted_at IS NULL
       FOR UPDATE`,
      [albumId, societyId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Album');
    }

    const oldAlbum = existing.rows[0];

    // Calculate total storage from photos to decrement
    const storageResult = await client.query(
      `SELECT COALESCE(SUM(file_size_bytes), 0) AS total_bytes
       FROM society_album_photos
       WHERE album_id = $1 AND society_id = $2 AND is_deleted = FALSE AND deleted_at IS NULL`,
      [albumId, societyId]
    );
    const freedBytes = parseInt(storageResult.rows[0].total_bytes);

    // Soft delete album with timestamp
    await client.query(
      `UPDATE society_albums
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $3, updated_at = NOW()
       WHERE id = $1 AND society_id = $2`,
      [albumId, societyId, user.userId]
    );

    // Cascade soft-delete all photos with timestamp
    await client.query(
      `UPDATE society_album_photos
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $3
       WHERE album_id = $1 AND society_id = $2 AND is_deleted = FALSE`,
      [albumId, societyId, user.userId]
    );

    // Decrement storage used
    if (freedBytes > 0) {
      await decrementStorageUsed(client, societyId, freedBytes);
    }

    await writeAuditLog(
      {
        action: 'ALBUM_DELETED',
        performedBy: user.userId,
        societyId,
        targetType: 'album',
        targetId: albumId,
        oldValue: { name: oldAlbum.name, photo_count: oldAlbum.photo_count },
        metadata: { deletedBy: user.fullName, freedBytes },
        ipAddress: ip,
      },
      client
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return ApiErrors.serverError('Delete album error:', error);
  } finally {
    client.release();
  }
}
