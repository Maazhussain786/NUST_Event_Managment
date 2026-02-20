/**
 * POST /api/upload/society-media
 *
 * Upload media to a society:
 * - logo (1:1, replaces old)
 * - cover (1:1, replaces old)
 * - gallery (1:N, max 200)
 *
 * Query params:
 *   ?societyId=<uuid>&type=logo|cover|gallery
 *
 * Permissions:
 *   President can upload everything.
 *   VP and Director can upload media.
 *   SuperAdmin has full control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { uploadBlob, deleteBlob, extractBlobName, CONTAINERS } from '@/lib/blob';
import {
  validateImageFile,
  validateMagicBytes,
  processImage,
  checkRateLimit,
  recordUpload,
  checkSocietyQuota,
  updateSocietyStorageUsed,
  checkEntityMediaCount,
  generateBlobPath,
  LIMITS,
} from '@/lib/upload';

type SocietyMediaType = 'logo' | 'cover' | 'gallery';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse params
    const { searchParams } = new URL(request.url);
    const societyId = searchParams.get('societyId');
    const mediaType = searchParams.get('type') as SocietyMediaType;

    if (!societyId) {
      return NextResponse.json({ error: 'societyId is required' }, { status: 400 });
    }
    if (!mediaType || !['logo', 'cover', 'gallery'].includes(mediaType)) {
      return NextResponse.json(
        { error: 'type must be: logo, cover, or gallery' },
        { status: 400 }
      );
    }

    // 3. Verify society exists
    const societyResult = await query(
      'SELECT id, name, logo_url FROM societies WHERE id = $1 AND deleted_at IS NULL',
      [societyId]
    );
    if (societyResult.rows.length === 0) {
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }
    const society = societyResult.rows[0];

    // 4. Permission check
    if (user.userType !== 'SUPER_ADMIN') {
      const permCheck = await query(
        `SELECT fn_has_privilege($1, $2, 'UPLOAD_MEDIA') AS has_upload,
                fn_has_privilege($1, $2, 'UPLOAD_CONTENT') AS has_content`,
        [user.userId, societyId]
      );
      const perms = permCheck.rows[0];
      if (!perms.has_upload && !perms.has_content) {
        return NextResponse.json(
          { error: 'You do not have permission to upload media to this society' },
          { status: 403 }
        );
      }
    }

    // 5. Rate limit
    const rateLimitError = checkRateLimit(user.userId, 0);
    if (rateLimitError) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 });
    }

    // 6. Form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const caption = formData.get('caption') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 7. Validate image
    const validation = validateImageFile(file.name, file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 8. Buffer and magic bytes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match its declared type' },
        { status: 400 }
      );
    }

    // 9. Gallery count limit
    if (mediaType === 'gallery') {
      const countError = await checkEntityMediaCount(
        'society_media',
        'society_id',
        societyId,
        LIMITS.SOCIETY_GALLERY_MAX,
        'GALLERY'
      );
      if (countError) {
        return NextResponse.json({ error: countError }, { status: 400 });
      }
    }

    // 10. Quota check
    const quotaError = await checkSocietyQuota(societyId, buffer.length);
    if (quotaError) {
      return NextResponse.json({ error: quotaError }, { status: 400 });
    }

    // 11. Process image
    const processed = await processImage(buffer, file.type);

    // 12. Upload to blob
    const blobPath = generateBlobPath('society', societyId, mediaType, file.name);
    const result = await uploadBlob(
      CONTAINERS.SOCIETY_MEDIA,
      blobPath,
      processed.buffer,
      processed.mimeType,
      { uploadedBy: user.userId, societyId, mediaType }
    );

    // 13. Database operations
    const dbMediaType = mediaType.toUpperCase() as 'LOGO' | 'COVER' | 'GALLERY';

    if (mediaType === 'logo' || mediaType === 'cover') {
      // Soft-delete old media of same type
      const oldMedia = await query(
        `SELECT id, file_url FROM society_media
         WHERE society_id = $1 AND media_type = $2 AND is_deleted = FALSE`,
        [societyId, dbMediaType]
      );

      for (const old of oldMedia.rows) {
        const oldBlob = extractBlobName(old.file_url, CONTAINERS.SOCIETY_MEDIA);
        if (oldBlob) await deleteBlob(CONTAINERS.SOCIETY_MEDIA, oldBlob);
      }

      await query(
        `UPDATE society_media SET is_deleted = TRUE, updated_at = NOW()
         WHERE society_id = $1 AND media_type = $2 AND is_deleted = FALSE`,
        [societyId, dbMediaType]
      );

      // Also update societies.logo_url for backward compatibility
      if (mediaType === 'logo') {
        await query(
          'UPDATE societies SET logo_url = $1, updated_at = NOW() WHERE id = $2',
          [result.url, societyId]
        );
      }
    }

    // Insert new media record
    await query(
      `INSERT INTO society_media
         (society_id, media_type, file_url, file_name, file_size_bytes, mime_type, caption, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        societyId,
        dbMediaType,
        result.url,
        file.name,
        result.sizeBytes,
        processed.mimeType,
        caption || null,
        user.userId,
      ]
    );

    // 14. Update storage usage
    await updateSocietyStorageUsed(societyId, result.sizeBytes);

    // 15. Record rate limit
    recordUpload(user.userId, result.sizeBytes);

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        mediaType,
        sizeBytes: result.sizeBytes,
        width: processed.width,
        height: processed.height,
      },
    });
  } catch (error) {
    console.error('Society media upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload society media' },
      { status: 500 }
    );
  }
}
