export const dynamic = 'force-dynamic';

/**
 * POST /api/upload/receipt?eventId=<uuid>   (FR-FIN-03 receipt attachment)
 * multipart/form-data with `file` (image or PDF). Stored privately; returns the
 * stored URL to send with the expense / sponsorship, plus a short-lived read URL.
 * Allowed: anyone who can log expenses for some team of the event, Finance,
 * or sponsor managers (for sponsorship payment proofs).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getClient } from '@/lib/db';
import { uploadBlob, deleteBlob, CONTAINERS, resolveMediaUrl } from '@/lib/blob';
import {
  validateAnyFile, validateMagicBytes, processImage, checkRateLimit, recordUpload,
  checkSocietyQuotaTx, updateSocietyStorageUsedTx, generateBlobPath, ALLOWED_IMAGE_MIMES,
} from '@/lib/upload';
import { ApiErrors } from '@/lib/api-utils';
import { getEventAccess, rules, can, forbidden } from '@/lib/rbac';
import { isUuid } from '@/lib/event-workspace';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const eventId = request.nextUrl.searchParams.get('eventId');
    if (!isUuid(eventId)) return ApiErrors.validation('eventId is required');
    const access = await getEventAccess(user, eventId);
    if (!access || access.event.deleted_at) return ApiErrors.notFound('Event');
    const allowed = access.teams.some((t) => t.teamRole === 'TEAM_LEAD') || can(access.society, 'MANAGE_FINANCE')
      || rules.verifyMoney(access) || rules.manageSponsorsForEvent(access);
    if (!allowed) return forbidden('You cannot upload receipts for this event.');

    const rateLimitError = checkRateLimit(user.userId, 0);
    if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return ApiErrors.validation('No file provided');
    const validation = validateAnyFile(file.name, file.type, file.size);
    if (!validation.valid) return ApiErrors.validation(validation.error || 'Invalid file');

    const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    if (!validateMagicBytes(buffer, file.type)) return ApiErrors.validation('File content does not match its declared type');

    let finalBuffer: Buffer = buffer;
    let finalMime = file.type;
    if (ALLOWED_IMAGE_MIMES.has(file.type)) {
      const processed = await processImage(buffer, file.type);
      finalBuffer = processed.buffer;
      finalMime = processed.mimeType;
    }

    const client = await getClient();
    let uploaded: { url: string; blobName: string; sizeBytes: number } | null = null;
    try {
      await client.query('BEGIN');
      const quota = await checkSocietyQuotaTx(client, access.event.society_id, finalBuffer.length);
      if (!quota.allowed) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: quota.error }, { status: 403 });
      }
      uploaded = await uploadBlob(
        CONTAINERS.NOTE_ATTACHMENTS,
        generateBlobPath('receipt', eventId, 'file', file.name),
        finalBuffer,
        finalMime,
        { uploadedBy: user.userId, eventId },
      );
      await updateSocietyStorageUsedTx(client, access.event.society_id, uploaded.sizeBytes);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (uploaded) await deleteBlob(CONTAINERS.NOTE_ATTACHMENTS, uploaded.blobName).catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    recordUpload(user.userId, uploaded.sizeBytes);
    return NextResponse.json({
      url: uploaded.url,
      readUrl: resolveMediaUrl(uploaded.url, { container: CONTAINERS.NOTE_ATTACHMENTS, expiresInMinutes: 60 }) || uploaded.url,
      fileName: file.name,
      sizeBytes: uploaded.sizeBytes,
    }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Receipt upload error:', error);
  }
}
