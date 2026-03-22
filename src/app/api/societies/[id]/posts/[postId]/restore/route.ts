export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  resolveEffectiveSocietyPrivilege,
} from '@/lib/api-utils';

/**
 * POST /api/societies/[id]/posts/[postId]/restore
 * Restore a soft-deleted post.
 * Requires MANAGE_CONTENT privilege.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; postId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const { id: societyId, postId } = params;
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

    // Fetch deleted post
    const postResult = await client.query(
      `SELECT id, content, post_type, deleted_at, deleted_by
       FROM society_posts
       WHERE id = $1 AND society_id = $2 AND (is_deleted = TRUE OR deleted_at IS NOT NULL)
       FOR UPDATE`,
      [postId, societyId]
    );
    if (postResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Deleted post');
    }

    const post = postResult.rows[0];

    // Restore post
    await client.query(
      `UPDATE society_posts
       SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
       WHERE id = $1 AND society_id = $2`,
      [postId, societyId]
    );

    // Restore post images
    await client.query(
      `UPDATE society_post_images
       SET deleted_at = NULL
       WHERE post_id = $1 AND deleted_at IS NOT NULL`,
      [postId]
    );

    await writeAuditLog(
      {
        action: 'POST_RESTORED',
        performedBy: user.userId,
        societyId,
        targetType: 'post',
        targetId: postId,
        oldValue: { deleted_at: post.deleted_at, deleted_by: post.deleted_by },
        metadata: { restoredBy: user.fullName },
        ipAddress: ip,
      },
      client
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return ApiErrors.serverError('Restore post error:', error);
  } finally {
    client.release();
  }
}
