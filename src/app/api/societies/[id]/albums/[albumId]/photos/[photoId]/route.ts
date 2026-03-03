export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * PATCH /api/societies/[id]/albums/[albumId]/photos/[photoId]
 * Update photo caption, featured status, or display_order.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; albumId: string; photoId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, albumId, photoId } = params;
    const body = await req.json();

    await client.query('BEGIN');

    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'MANAGE_CONTENT') AS allowed`,
      [user.userId, societyId]
    );
    if (!privCheck.rows[0].allowed) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If setting as featured, unset all others first
    if (body.is_featured === true) {
      await client.query(
        `UPDATE society_album_photos SET is_featured = FALSE WHERE album_id = $1`,
        [albumId]
      );
    }

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (body.caption !== undefined) {
      sets.push(`caption = $${idx++}`);
      vals.push(body.caption?.trim() || null);
    }
    if (body.is_featured !== undefined) {
      sets.push(`is_featured = $${idx++}`);
      vals.push(body.is_featured);
    }
    if (body.display_order !== undefined) {
      sets.push(`display_order = $${idx++}`);
      vals.push(body.display_order);
    }

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    vals.push(photoId, albumId, societyId);

    const result = await client.query(
      `UPDATE society_album_photos SET ${sets.join(', ')}
       WHERE id = $${idx++} AND album_id = $${idx++} AND society_id = $${idx} AND is_deleted = FALSE
       RETURNING id`,
      vals
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // If setting featured, also update album cover
    if (body.is_featured === true) {
      await client.query(
        `UPDATE society_albums SET cover_photo_id = $1, updated_at = NOW() WHERE id = $2`,
        [photoId, albumId]
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update photo error:', error);
    return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/societies/[id]/albums/[albumId]/photos/[photoId]
 * Soft-delete a photo from an album.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; albumId: string; photoId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, albumId, photoId } = params;

    await client.query('BEGIN');

    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'MANAGE_CONTENT') AS allowed`,
      [user.userId, societyId]
    );
    if (!privCheck.rows[0].allowed) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await client.query(
      `UPDATE society_album_photos SET is_deleted = TRUE
       WHERE id = $1 AND album_id = $2 AND society_id = $3 AND is_deleted = FALSE
       RETURNING id`,
      [photoId, albumId, societyId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Decrement photo count
    await client.query(
      `UPDATE society_albums SET photo_count = GREATEST(0, photo_count - 1), updated_at = NOW()
       WHERE id = $1`,
      [albumId]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete photo error:', error);
    return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 });
  } finally {
    client.release();
  }
}
