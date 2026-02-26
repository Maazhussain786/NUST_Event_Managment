export const dynamic = 'force-dynamic';

/**
 * POST /api/upload/event-media
 *
 * Upload media to an event:
 * - thumbnail (1:1, stored on events table)
 * - banner (1:1, stored on events table)
 * - gallery (1:N, stored in event_media table)
 * - document (1:N, stored in event_media table)
 *
 * Query params:
 *   ?eventId=<uuid>&type=thumbnail|banner|gallery|document
 *
 * Permissions:
 *   President, VP, Director can upload.
 *   SuperAdmin has full control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, getClient } from '@/lib/db';
import { uploadBlob, deleteBlob, extractBlobName, CONTAINERS } from '@/lib/blob';
import {
  validateImageFile,
  validateDocumentFile,
  validateMagicBytes,
  processImage,
  checkRateLimit,
  recordUpload,
  checkSocietyQuotaTx,
  updateSocietyStorageUsedTx,
  logQuotaExceeded,
  checkEntityMediaCount,
  generateBlobPath,
  LIMITS,
} from '@/lib/upload';

type MediaType = 'thumbnail' | 'banner' | 'gallery' | 'document';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse params
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const mediaType = searchParams.get('type') as MediaType;

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }
    if (!mediaType || !['thumbnail', 'banner', 'gallery', 'document'].includes(mediaType)) {
      return NextResponse.json(
        { error: 'type must be: thumbnail, banner, gallery, or document' },
        { status: 400 }
      );
    }

    // 3. Verify event exists and get society_id
    const eventResult = await query(
      'SELECT id, society_id, thumbnail_url, banner_url FROM events WHERE id = $1',
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const event = eventResult.rows[0];

    // 4. Permission check: must be SuperAdmin OR have UPLOAD_MEDIA / CREATE_EVENT privilege
    if (user.userType !== 'SUPER_ADMIN') {
      const permCheck = await query(
        `SELECT fn_has_privilege($1, $2, 'UPLOAD_MEDIA') AS has_upload,
                fn_has_privilege($1, $2, 'CREATE_EVENT') AS has_create`,
        [user.userId, event.society_id]
      );
      const perms = permCheck.rows[0];
      if (!perms.has_upload && !perms.has_create) {
        return NextResponse.json(
          { error: 'You do not have permission to upload media to this event' },
          { status: 403 }
        );
      }
    }

    // 5. Rate limit check
    const rateLimitError = checkRateLimit(user.userId, 0);
    if (rateLimitError) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 });
    }

    // 6. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const caption = formData.get('caption') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 7. Validate based on media type
    const isDocument = mediaType === 'document';
    const validation = isDocument
      ? validateDocumentFile(file.name, file.type, file.size)
      : validateImageFile(file.name, file.type, file.size);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 8. Read buffer and validate magic bytes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match its declared type' },
        { status: 400 }
      );
    }

    // 9. Check gallery count limit
    if (mediaType === 'gallery') {
      const countError = await checkEntityMediaCount(
        'event_media',
        'event_id',
        eventId,
        LIMITS.EVENT_GALLERY_MAX,
        'GALLERY'
      );
      if (countError) {
        return NextResponse.json({ error: countError }, { status: 400 });
      }
    }

    // 10. Process image (not documents) — before transaction
    let finalBuffer: Buffer = buffer;
    let finalMimeType = file.type;
    let processedWidth = 0;
    let processedHeight = 0;

    if (!isDocument) {
      const processed = await processImage(buffer, file.type);
      finalBuffer = processed.buffer;
      finalMimeType = processed.mimeType;
      processedWidth = processed.width;
      processedHeight = processed.height;
    }

    // 11. Transactional: quota check → upload → DB save → increment
    const client = await getClient();
    let blobUploaded: { url: string; blobName: string; sizeBytes: number } | null = null;

    try {
      await client.query('BEGIN');

      // Lock society_settings row and check quota
      const quotaResult = await checkSocietyQuotaTx(client, event.society_id, finalBuffer.length);
      if (!quotaResult.allowed) {
        await logQuotaExceeded(
          client, user.userId, event.society_id, finalBuffer.length,
          quotaResult.quota ?? 0, quotaResult.used ?? 0
        );
        await client.query('COMMIT'); // commit the audit log
        return NextResponse.json({ error: quotaResult.error }, { status: 403 });
      }

      // Upload to Blob (within lock window)
      const blobPath = generateBlobPath('event', eventId, mediaType, file.name);
      const result = await uploadBlob(
        CONTAINERS.EVENT_MEDIA,
        blobPath,
        finalBuffer,
        finalMimeType,
        { uploadedBy: user.userId, eventId, mediaType }
      );
      blobUploaded = result;

      // DB save based on type
      if (mediaType === 'thumbnail') {
        if (event.thumbnail_url) {
          const oldBlob = extractBlobName(event.thumbnail_url, CONTAINERS.EVENT_MEDIA);
          if (oldBlob) await deleteBlob(CONTAINERS.EVENT_MEDIA, oldBlob);
        }
        await client.query(
          'UPDATE events SET thumbnail_url = $1, updated_at = NOW() WHERE id = $2',
          [result.url, eventId]
        );
      } else if (mediaType === 'banner') {
        if (event.banner_url) {
          const oldBlob = extractBlobName(event.banner_url, CONTAINERS.EVENT_MEDIA);
          if (oldBlob) await deleteBlob(CONTAINERS.EVENT_MEDIA, oldBlob);
        }
        await client.query(
          'UPDATE events SET banner_url = $1, updated_at = NOW() WHERE id = $2',
          [result.url, eventId]
        );
      } else {
        const dbMediaType = mediaType === 'gallery' ? 'GALLERY' : 'DOCUMENT';
        await client.query(
          `INSERT INTO event_media
             (event_id, media_type, file_url, file_name, file_size_bytes, mime_type, caption, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [eventId, dbMediaType, result.url, file.name, result.sizeBytes, finalMimeType, caption || null, user.userId]
        );
      }

      // Atomic storage increment
      await updateSocietyStorageUsedTx(client, event.society_id, result.sizeBytes);

      await client.query('COMMIT');

      // Record upload for rate limiting (in-memory)
      recordUpload(user.userId, result.sizeBytes);

      return NextResponse.json({
        success: true,
        data: {
          url: result.url,
          mediaType,
          sizeBytes: result.sizeBytes,
          ...(processedWidth && { width: processedWidth, height: processedHeight }),
        },
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      // Clean up blob if it was uploaded before DB failed
      if (blobUploaded) {
        try { await deleteBlob(CONTAINERS.EVENT_MEDIA, blobUploaded.blobName); } catch { /* best-effort */ }
      }
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Event media upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload event media' },
      { status: 500 }
    );
  }
}
