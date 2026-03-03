export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/societies/[id]/albums/[albumId]
 * Get album details with photos.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; albumId: string } }
) {
  try {
    const { id: societyId, albumId } = params;

    const albumResult = await query(
      `SELECT a.id, a.name, a.description, a.category, a.photo_count,
              a.created_at, a.updated_at,
              u.full_name AS created_by_name
       FROM society_albums a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = $1 AND a.society_id = $2 AND a.is_deleted = FALSE`,
      [albumId, societyId]
    );

    if (albumResult.rows.length === 0) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 });
    }

    const photosResult = await query(
      `SELECT p.id, p.file_url, p.file_name, p.file_size_bytes, p.mime_type,
              p.caption, p.is_featured, p.display_order, p.created_at,
              u.full_name AS uploaded_by_name
       FROM society_album_photos p
       LEFT JOIN users u ON p.uploaded_by = u.id
       WHERE p.album_id = $1 AND p.society_id = $2 AND p.is_deleted = FALSE
       ORDER BY p.display_order, p.created_at DESC`,
      [albumId, societyId]
    );

    return NextResponse.json({
      album: albumResult.rows[0],
      photos: photosResult.rows,
    });
  } catch (error) {
    console.error('Fetch album details error:', error);
    return NextResponse.json({ error: 'Failed to fetch album' }, { status: 500 });
  }
}

/**
 * PATCH /api/societies/[id]/albums/[albumId]
 * Update album name, description, category.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; albumId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, albumId } = params;
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

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (body.name !== undefined) {
      sets.push(`name = $${idx++}`);
      vals.push(body.name.trim());
    }
    if (body.description !== undefined) {
      sets.push(`description = $${idx++}`);
      vals.push(body.description?.trim() || null);
    }
    if (body.category !== undefined) {
      sets.push(`category = $${idx++}`);
      vals.push(body.category);
    }
    if (body.cover_photo_id !== undefined) {
      sets.push(`cover_photo_id = $${idx++}`);
      vals.push(body.cover_photo_id);
    }

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    vals.push(albumId, societyId);

    const result = await client.query(
      `UPDATE society_albums SET ${sets.join(', ')} WHERE id = $${idx++} AND society_id = $${idx} AND is_deleted = FALSE RETURNING id`,
      vals
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Album not found' }, { status: 404 });
    }

    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value)
       VALUES ('ALBUM_UPDATED', $1, $2, 'album', $3, $4)`,
      [user.userId, societyId, albumId, JSON.stringify(body)]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update album error:', error);
    return NextResponse.json({ error: 'Failed to update album' }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/societies/[id]/albums/[albumId]
 * Soft-delete an album.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; albumId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, albumId } = params;

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
      `UPDATE society_albums SET is_deleted = TRUE, updated_at = NOW()
       WHERE id = $1 AND society_id = $2 AND is_deleted = FALSE RETURNING id`,
      [albumId, societyId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Album not found' }, { status: 404 });
    }

    // Also soft-delete all photos in the album
    await client.query(
      `UPDATE society_album_photos SET is_deleted = TRUE WHERE album_id = $1 AND society_id = $2`,
      [albumId, societyId]
    );

    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id)
       VALUES ('ALBUM_DELETED', $1, $2, 'album', $3)`,
      [user.userId, societyId, albumId]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete album error:', error);
    return NextResponse.json({ error: 'Failed to delete album' }, { status: 500 });
  } finally {
    client.release();
  }
}
