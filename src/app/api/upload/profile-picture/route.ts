export const dynamic = 'force-dynamic';

/**
 * POST /api/upload/profile-picture
 *
 * Upload or replace user profile picture.
 * - Auth required
 * - Max 8MB image
 * - Auto-resized to max 1920px
 * - Old picture is replaced (soft delete in blob storage)
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
  generateBlobPath,
} from '@/lib/upload';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Rate limit check
    const rateLimitError = checkRateLimit(user.userId, 0);
    if (rateLimitError) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 });
    }

    // 3. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 4. Validate file type and size
    const validation = validateImageFile(file.name, file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 5. Read buffer and validate magic bytes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match its declared type' },
        { status: 400 }
      );
    }

    // 6. Process image (resize, compress, strip EXIF)
    const processed = await processImage(buffer, file.type);

    // 7. Generate unique blob path
    const blobPath = generateBlobPath('user', user.userId, 'avatar', file.name);

    // 8. Upload to Azure Blob
    const result = await uploadBlob(
      CONTAINERS.PROFILE_PICTURES,
      blobPath,
      processed.buffer,
      processed.mimeType,
      { uploadedBy: user.userId }
    );

    // 9. Get old avatar URL and delete old blob
    const oldAvatar = await query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [user.userId]
    );
    const oldUrl = oldAvatar.rows[0]?.avatar_url;

    if (oldUrl) {
      const oldBlobName = extractBlobName(oldUrl, CONTAINERS.PROFILE_PICTURES);
      if (oldBlobName) {
        await deleteBlob(CONTAINERS.PROFILE_PICTURES, oldBlobName);
      }
    }

    // 10. Update user avatar_url in database
    await query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
      [result.url, user.userId]
    );

    // 11. Record upload for rate limiting
    recordUpload(user.userId, result.sizeBytes);

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        sizeBytes: result.sizeBytes,
        width: processed.width,
        height: processed.height,
        compressionRatio: (
          (1 - processed.processedSize / processed.originalSize) *
          100
        ).toFixed(1),
      },
    });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload profile picture' },
      { status: 500 }
    );
  }
}
