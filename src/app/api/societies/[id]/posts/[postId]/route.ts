export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  checkSocietyOperational,
  resolveEffectiveSocietyPrivilege,
} from '@/lib/api-utils';

/**
 * PATCH /api/societies/[id]/posts/[postId]
 * Edit a post (content, pin status).
 * Uses FOR UPDATE lock and version increment.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; postId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const { id: societyId, postId } = params;
    const body = await req.json();
    const ip = extractIpAddress(req);

    await client.query('BEGIN');

    // Society operational check
    const societyCheck = await checkSocietyOperational(societyId, client);
    if (societyCheck) { await client.query('ROLLBACK'); return societyCheck; }

    // Auth
    const effectiveManageContent = await resolveEffectiveSocietyPrivilege(
      { userId: user.userId, societyId, privilegeName: 'MANAGE_CONTENT' },
      client,
    );
    if (!effectiveManageContent.allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have MANAGE_CONTENT privilege');
    }

    // Fetch post with FOR UPDATE
    const existing = await client.query(
      `SELECT id, author_id, content, is_pinned, post_type, version
       FROM society_posts
       WHERE id = $1 AND society_id = $2 AND is_deleted = FALSE AND deleted_at IS NULL
       FOR UPDATE`,
      [postId, societyId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Post');
    }

    const oldPost = existing.rows[0];

    // Build dynamic update
    const sets: string[] = [];
    const vals: any[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    let idx = 1;

    if (body.content !== undefined) {
      oldValues.content = oldPost.content;
      newValues.content = body.content?.trim() || null;
      sets.push(`content = $${idx++}`);
      vals.push(body.content?.trim() || null);
    }
    if (body.is_pinned !== undefined) {
      oldValues.is_pinned = oldPost.is_pinned;
      newValues.is_pinned = body.is_pinned;
      sets.push(`is_pinned = $${idx++}`);
      vals.push(body.is_pinned);
    }
    if (body.post_type !== undefined) {
      oldValues.post_type = oldPost.post_type;
      newValues.post_type = body.post_type;
      sets.push(`post_type = $${idx++}`);
      vals.push(body.post_type);
    }

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.validation('No fields to update');
    }

    sets.push(`updated_at = NOW()`);
    sets.push(`version = COALESCE(version, 1) + 1`);
    vals.push(postId);
    vals.push(societyId);

    await client.query(
      `UPDATE society_posts SET ${sets.join(', ')} WHERE id = $${idx++} AND society_id = $${idx}`,
      vals
    );

    // Audit with old/new + IP
    await writeAuditLog(
      {
        action: 'POST_UPDATED',
        performedBy: user.userId,
        societyId,
        targetType: 'post',
        targetId: postId,
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
    return ApiErrors.serverError('Update post error:', error);
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/societies/[id]/posts/[postId]
 * Soft-delete a post using deleted_at timestamp.
 * Cascade soft-deletes post images.
 */
export async function DELETE(
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

    // Society operational check
    const societyCheck = await checkSocietyOperational(societyId, client);
    if (societyCheck) { await client.query('ROLLBACK'); return societyCheck; }

    // Auth
    const effectiveManageContent = await resolveEffectiveSocietyPrivilege(
      { userId: user.userId, societyId, privilegeName: 'MANAGE_CONTENT' },
      client,
    );
    if (!effectiveManageContent.allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have MANAGE_CONTENT privilege');
    }

    // Fetch post for audit snapshot + lock
    const existing = await client.query(
      `SELECT id, content, post_type, is_pinned, author_id
       FROM society_posts
       WHERE id = $1 AND society_id = $2 AND is_deleted = FALSE AND deleted_at IS NULL
       FOR UPDATE`,
      [postId, societyId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Post');
    }

    const oldPost = existing.rows[0];

    // Soft delete with timestamp
    await client.query(
      `UPDATE society_posts
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $3, updated_at = NOW()
       WHERE id = $1 AND society_id = $2`,
      [postId, societyId, user.userId]
    );

    // Cascade soft-delete post images
    await client.query(
      `UPDATE society_post_images
       SET deleted_at = NOW()
       WHERE post_id = $1 AND deleted_at IS NULL`,
      [postId]
    );

    // Audit with old value + IP
    await writeAuditLog(
      {
        action: 'POST_DELETED',
        performedBy: user.userId,
        societyId,
        targetType: 'post',
        targetId: postId,
        oldValue: { content: oldPost.content, post_type: oldPost.post_type, is_pinned: oldPost.is_pinned },
        metadata: { deletedBy: user.fullName, authorId: oldPost.author_id },
        ipAddress: ip,
      },
      client
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return ApiErrors.serverError('Delete post error:', error);
  } finally {
    client.release();
  }
}
