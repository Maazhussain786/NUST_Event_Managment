export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * PATCH /api/societies/[id]/posts/[postId]
 * Edit a post (content, pin status).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; postId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, postId } = params;
    const body = await req.json();

    await client.query('BEGIN');

    // Auth
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'MANAGE_CONTENT') AS allowed`,
      [user.userId, societyId]
    );
    if (!privCheck.rows[0].allowed) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify post exists
    const existing = await client.query(
      `SELECT id, author_id FROM society_posts WHERE id = $1 AND society_id = $2 AND is_deleted = FALSE`,
      [postId, societyId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Build dynamic update
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (body.content !== undefined) {
      sets.push(`content = $${idx++}`);
      vals.push(body.content?.trim() || null);
    }
    if (body.is_pinned !== undefined) {
      sets.push(`is_pinned = $${idx++}`);
      vals.push(body.is_pinned);
    }
    if (body.post_type !== undefined) {
      sets.push(`post_type = $${idx++}`);
      vals.push(body.post_type);
    }

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    vals.push(postId);
    vals.push(societyId);

    await client.query(
      `UPDATE society_posts SET ${sets.join(', ')} WHERE id = $${idx++} AND society_id = $${idx}`,
      vals
    );

    // Audit
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value)
       VALUES ('POST_UPDATED', $1, $2, 'post', $3, $4)`,
      [user.userId, societyId, postId, JSON.stringify(body)]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update post error:', error);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/societies/[id]/posts/[postId]
 * Soft-delete a post.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; postId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, postId } = params;

    await client.query('BEGIN');

    // Auth
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'MANAGE_CONTENT') AS allowed`,
      [user.userId, societyId]
    );
    if (!privCheck.rows[0].allowed) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft delete
    const result = await client.query(
      `UPDATE society_posts SET is_deleted = TRUE, updated_at = NOW()
       WHERE id = $1 AND society_id = $2 AND is_deleted = FALSE
       RETURNING id`,
      [postId, societyId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Audit
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id)
       VALUES ('POST_DELETED', $1, $2, 'post', $3)`,
      [user.userId, societyId, postId]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete post error:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  } finally {
    client.release();
  }
}
