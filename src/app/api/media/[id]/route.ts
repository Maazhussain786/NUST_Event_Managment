/**
 * DELETE /api/media/[id]
 * PATCH  /api/media/[id]  (restore)
 *
 * Soft-delete or restore media across all 4 media tables.
 * Hard-delete option available for permanent removal + blob cleanup.
 *
 * Query params:
 *   ?table=society_media|event_media|post_attachments|note_attachments
 *   ?hard=true  (optional — permanently delete + remove blob)
 *
 * Permissions:
 *   Uploader, or UPLOAD_MEDIA / DELETE_CONTENT privilege, or SuperAdmin.
 *
 * Storage decrement/increment handled by DB triggers automatically.
 * Hard-delete: blob must be deleted first; if blob deletion fails → rollback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getClient } from '@/lib/db';
import { deleteBlob, extractBlobName, CONTAINERS, ContainerName } from '@/lib/blob';

type MediaTable = 'society_media' | 'event_media' | 'post_attachments' | 'event_note_attachments';

const TABLE_CONFIG: Record<MediaTable, {
  societyIdQuery: string;
  container: ContainerName;
}> = {
  society_media: {
    societyIdQuery: 'SELECT society_id, file_url, file_size_bytes, uploaded_by, is_deleted FROM society_media WHERE id = $1',
    container: CONTAINERS.SOCIETY_MEDIA,
  },
  event_media: {
    societyIdQuery: `SELECT e.society_id, em.file_url, em.file_size_bytes, em.uploaded_by, em.is_deleted
                     FROM event_media em JOIN events e ON e.id = em.event_id WHERE em.id = $1`,
    container: CONTAINERS.EVENT_MEDIA,
  },
  post_attachments: {
    societyIdQuery: `SELECT p.society_id, pa.file_url, pa.file_size_bytes, pa.uploaded_by, pa.is_deleted
                     FROM post_attachments pa JOIN posts p ON p.id = pa.post_id WHERE pa.id = $1`,
    container: CONTAINERS.POST_ATTACHMENTS,
  },
  event_note_attachments: {
    societyIdQuery: `SELECT e.society_id, ena.file_url, ena.file_size_bytes, ena.uploaded_by, ena.is_deleted
                     FROM event_note_attachments ena
                     JOIN event_notes en ON en.id = ena.note_id
                     JOIN events e ON e.id = en.event_id WHERE ena.id = $1`,
    container: CONTAINERS.NOTE_ATTACHMENTS,
  },
};

const VALID_TABLES = new Set(Object.keys(TABLE_CONFIG));

/**
 * DELETE — Soft-delete or hard-delete media
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: mediaId } = params;
    const { searchParams } = new URL(req.url);
    const table = searchParams.get('table') as MediaTable;
    const hardDelete = searchParams.get('hard') === 'true';

    if (!table || !VALID_TABLES.has(table)) {
      return NextResponse.json(
        { error: 'table param required: society_media, event_media, post_attachments, or event_note_attachments' },
        { status: 400 }
      );
    }

    const config = TABLE_CONFIG[table];

    await client.query('BEGIN');

    // Fetch media with lock
    const mediaResult = await client.query(
      config.societyIdQuery + ' FOR UPDATE',
      [mediaId]
    );

    if (mediaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    const media = mediaResult.rows[0];

    // Permission check
    if (user.userType !== 'SUPER_ADMIN' && media.uploaded_by !== user.userId) {
      const permCheck = await client.query(
        `SELECT fn_has_privilege($1, $2, 'UPLOAD_MEDIA') AS has_perm`,
        [user.userId, media.society_id]
      );
      if (!permCheck.rows[0]?.has_perm) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'No permission to delete this media' }, { status: 403 });
      }
    }

    if (hardDelete) {
      // Hard delete: blob first, then DB row
      // If blob deletion fails → rollback (no orphan DB rows)
      if (media.file_url) {
        const blobName = extractBlobName(media.file_url, config.container);
        if (blobName) {
          const blobDeleted = await deleteBlob(config.container, blobName);
          if (!blobDeleted) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Failed to delete blob — operation rolled back' }, { status: 500 });
          }
        }
      }

      // DELETE row (trigger handles storage decrement if is_deleted was FALSE)
      await client.query(`DELETE FROM ${table} WHERE id = $1`, [mediaId]);

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, metadata)
         VALUES ('STORAGE_DECREMENT', $1, $2, $3, $4, $5, $6)`,
        [
          user.userId,
          media.society_id,
          table,
          mediaId,
          JSON.stringify({ file_size_bytes: media.file_size_bytes, was_soft_deleted: media.is_deleted }),
          JSON.stringify({ operation: 'hard_delete', file_url: media.file_url }),
        ]
      );
    } else {
      // Soft-delete
      if (media.is_deleted) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Media is already deleted' }, { status: 409 });
      }

      // Set is_deleted = TRUE (trigger decrements storage automatically)
      if (table === 'society_media' || table === 'event_media') {
        await client.query(
          `UPDATE ${table} SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
          [mediaId]
        );
      } else {
        // post_attachments and event_note_attachments lack updated_at
        await client.query(
          `UPDATE ${table} SET is_deleted = TRUE WHERE id = $1`,
          [mediaId]
        );
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, metadata)
         VALUES ('STORAGE_DECREMENT', $1, $2, $3, $4, $5, $6)`,
        [
          user.userId,
          media.society_id,
          table,
          mediaId,
          JSON.stringify({ file_size_bytes: media.file_size_bytes }),
          JSON.stringify({ operation: 'soft_delete', file_url: media.file_url }),
        ]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      operation: hardDelete ? 'hard_delete' : 'soft_delete',
      freedBytes: media.is_deleted ? 0 : parseInt(media.file_size_bytes || '0', 10),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Media delete error:', error);
    return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * PATCH — Restore soft-deleted media
 *
 * Restores is_deleted = FALSE.
 * DB trigger automatically re-increments storage_used_bytes.
 * Rejects if quota would be exceeded after restore.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: mediaId } = params;
    const { searchParams } = new URL(req.url);
    const table = searchParams.get('table') as MediaTable;

    if (!table || !VALID_TABLES.has(table)) {
      return NextResponse.json(
        { error: 'table param required: society_media, event_media, post_attachments, or event_note_attachments' },
        { status: 400 }
      );
    }

    const config = TABLE_CONFIG[table];

    await client.query('BEGIN');

    // Fetch media
    const mediaResult = await client.query(
      config.societyIdQuery + ' FOR UPDATE',
      [mediaId]
    );

    if (mediaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    const media = mediaResult.rows[0];

    if (!media.is_deleted) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Media is not deleted' }, { status: 409 });
    }

    // Permission check
    if (user.userType !== 'SUPER_ADMIN' && media.uploaded_by !== user.userId) {
      const permCheck = await client.query(
        `SELECT fn_has_privilege($1, $2, 'UPLOAD_MEDIA') AS has_perm`,
        [user.userId, media.society_id]
      );
      if (!permCheck.rows[0]?.has_perm) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'No permission to restore this media' }, { status: 403 });
      }
    }

    // Check if restoring would exceed quota
    const quotaCheck = await client.query(
      `SELECT COALESCE(ss.storage_quota_bytes, 524288000) AS quota,
              COALESCE(ss.storage_used_bytes, 0) AS used
       FROM society_settings ss
       WHERE ss.society_id = $1
       FOR UPDATE`,
      [media.society_id]
    );

    if (quotaCheck.rows.length > 0) {
      const { quota, used } = quotaCheck.rows[0];
      const fileBytes = parseInt(media.file_size_bytes || '0', 10);
      if (parseInt(used, 10) + fileBytes > parseInt(quota, 10)) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Cannot restore — would exceed storage quota' },
          { status: 403 }
        );
      }
    }

    // Restore (trigger re-increments storage)
    if (table === 'society_media' || table === 'event_media') {
      await client.query(
        `UPDATE ${table} SET is_deleted = FALSE, updated_at = NOW() WHERE id = $1`,
        [mediaId]
      );
    } else {
      await client.query(
        `UPDATE ${table} SET is_deleted = FALSE WHERE id = $1`,
        [mediaId]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      operation: 'restore',
      restoredBytes: parseInt(media.file_size_bytes || '0', 10),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Media restore error:', error);
    return NextResponse.json({ error: 'Failed to restore media' }, { status: 500 });
  } finally {
    client.release();
  }
}
