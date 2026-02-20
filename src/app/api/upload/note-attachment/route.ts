/**
 * POST /api/upload/note-attachment
 *
 * Upload a file to an internal event note.
 * Max 20 attachments per note.
 *
 * Query params:
 *   ?noteId=<uuid>
 *
 * Permissions:
 *   Event organizers only (President, VP, Director, or note author).
 *   SuperAdmin has full control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { uploadBlob, CONTAINERS } from '@/lib/blob';
import {
  validateAnyFile,
  validateMagicBytes,
  processImage,
  checkRateLimit,
  recordUpload,
  checkSocietyQuota,
  updateSocietyStorageUsed,
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
    const noteId = searchParams.get('noteId');

    if (!noteId) {
      return NextResponse.json({ error: 'noteId is required' }, { status: 400 });
    }

    // Verify note exists, get event and society context
    const noteResult = await query(
      `SELECT en.id, en.event_id, en.author_id, e.society_id
       FROM event_notes en
       JOIN events e ON e.id = en.event_id
       WHERE en.id = $1 AND en.is_deleted = FALSE`,
      [noteId]
    );
    if (noteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    const note = noteResult.rows[0];

    // Permission check: must be SuperAdmin, note author, or have VIEW_EVENT_NOTES privilege
    if (user.userType !== 'SUPER_ADMIN' && note.author_id !== user.userId) {
      const permCheck = await query(
        `SELECT fn_has_privilege($1, $2, 'CREATE_EVENT_NOTE') AS has_create,
                fn_has_privilege($1, $2, 'EDIT_EVENT_NOTE') AS has_edit`,
        [user.userId, note.society_id]
      );
      const perms = permCheck.rows[0];
      if (!perms.has_create && !perms.has_edit) {
        return NextResponse.json(
          { error: 'You do not have permission to add attachments to this note' },
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
      'event_note_attachments',
      'note_id',
      noteId,
      LIMITS.NOTE_ATTACHMENTS_MAX
    );
    if (countError) {
      return NextResponse.json({ error: countError }, { status: 400 });
    }

    // Parse file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

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

    // Quota
    const quotaError = await checkSocietyQuota(note.society_id, buffer.length);
    if (quotaError) {
      return NextResponse.json({ error: quotaError }, { status: 400 });
    }

    // Process images
    let finalBuffer: Buffer = buffer;
    let finalMimeType = file.type;

    if (ALLOWED_IMAGE_MIMES.has(file.type)) {
      const processed = await processImage(buffer, file.type);
      finalBuffer = processed.buffer;
      finalMimeType = processed.mimeType;
    }

    // Upload
    const blobPath = generateBlobPath('note', noteId, 'attachment', file.name);
    const result = await uploadBlob(
      CONTAINERS.NOTE_ATTACHMENTS,
      blobPath,
      finalBuffer,
      finalMimeType,
      { uploadedBy: user.userId, noteId }
    );

    // Save to DB
    await query(
      `INSERT INTO event_note_attachments
         (note_id, file_url, file_name, file_size_bytes, mime_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [noteId, result.url, file.name, result.sizeBytes, finalMimeType, user.userId]
    );

    // Update quota
    await updateSocietyStorageUsed(note.society_id, result.sizeBytes);
    recordUpload(user.userId, result.sizeBytes);

    return NextResponse.json({
      success: true,
      data: { url: result.url, sizeBytes: result.sizeBytes },
    });
  } catch (error) {
    console.error('Note attachment upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload note attachment' },
      { status: 500 }
    );
  }
}
