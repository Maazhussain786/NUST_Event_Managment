/**
 * POST /api/upload/post-attachment
 *
 * Upload an image or PDF to a post.
 * Max 20 attachments per post.
 *
 * Query params:
 *   ?postId=<uuid>
 *
 * Permissions:
 *   Author of the post, or anyone with CREATE_POST / EDIT_POST privilege on the society.
 *   SuperAdmin has full control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, getClient } from '@/lib/db';
import { uploadBlob, deleteBlob, CONTAINERS } from '@/lib/blob';
import {
  validateAnyFile,
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
  ALLOWED_IMAGE_MIMES,
} from '@/lib/upload';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');

    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 });
    }

    // Verify post exists and get society_id
    const postResult = await query(
      `SELECT p.id, p.society_id, p.author_id
       FROM posts p WHERE p.id = $1 AND p.is_deleted = FALSE`,
      [postId]
    );
    if (postResult.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const post = postResult.rows[0];

    // Permission check
    if (user.userType !== 'SUPER_ADMIN' && post.author_id !== user.userId) {
      const permCheck = await query(
        `SELECT fn_has_privilege($1, $2, 'CREATE_POST') AS has_create,
                fn_has_privilege($1, $2, 'EDIT_POST') AS has_edit`,
        [user.userId, post.society_id]
      );
      const perms = permCheck.rows[0];
      if (!perms.has_create && !perms.has_edit) {
        return NextResponse.json(
          { error: 'You do not have permission to add attachments to this post' },
          { status: 403 }
        );
      }
    }

    // Rate limit
    const rateLimitError = checkRateLimit(user.userId, 0);
    if (rateLimitError) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 });
    }

    // Count limit
    const countError = await checkEntityMediaCount(
      'post_attachments',
      'post_id',
      postId,
      LIMITS.POST_ATTACHMENTS_MAX
    );
    if (countError) {
      return NextResponse.json({ error: countError }, { status: 400 });
    }

    // Parse file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const caption = formData.get('caption') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate
    const validation = validateAnyFile(file.name, file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match its declared type' },
        { status: 400 }
      );
    }

    // Process images, pass through documents — before transaction
    let finalBuffer: Buffer = buffer;
    let finalMimeType = file.type;

    if (ALLOWED_IMAGE_MIMES.has(file.type)) {
      const processed = await processImage(buffer, file.type);
      finalBuffer = processed.buffer;
      finalMimeType = processed.mimeType;
    }

    // Transactional: quota check → upload → DB save → increment
    const client = await getClient();
    let blobUploaded: { url: string; blobName: string; sizeBytes: number } | null = null;

    try {
      await client.query('BEGIN');

      const quotaResult = await checkSocietyQuotaTx(client, post.society_id, finalBuffer.length);
      if (!quotaResult.allowed) {
        await logQuotaExceeded(
          client, user.userId, post.society_id, finalBuffer.length,
          quotaResult.quota ?? 0, quotaResult.used ?? 0
        );
        await client.query('COMMIT');
        return NextResponse.json({ error: quotaResult.error }, { status: 403 });
      }

      const blobPath = generateBlobPath('post', postId, 'attachment', file.name);
      const result = await uploadBlob(
        CONTAINERS.POST_ATTACHMENTS,
        blobPath,
        finalBuffer,
        finalMimeType,
        { uploadedBy: user.userId, postId }
      );
      blobUploaded = result;

      await client.query(
        `INSERT INTO post_attachments
           (post_id, file_url, file_name, file_size_bytes, mime_type, caption, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [postId, result.url, file.name, result.sizeBytes, finalMimeType, caption || null, user.userId]
      );

      await updateSocietyStorageUsedTx(client, post.society_id, result.sizeBytes);

      await client.query('COMMIT');

      recordUpload(user.userId, result.sizeBytes);

      return NextResponse.json({
        success: true,
        data: { url: result.url, sizeBytes: result.sizeBytes },
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      if (blobUploaded) {
        try { await deleteBlob(CONTAINERS.POST_ATTACHMENTS, blobUploaded.blobName); } catch { /* best-effort */ }
      }
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Post attachment upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload post attachment' },
      { status: 500 }
    );
  }
}
