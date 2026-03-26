export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';

function signMediaUrl(url: string | null | undefined): string | null | undefined {
  if (!url) return url;
  return (
    resolveMediaUrl(url, {
      container: [
        CONTAINERS.SOCIETY_MEDIA,
        CONTAINERS.EVENT_MEDIA,
        CONTAINERS.POST_ATTACHMENTS,
        CONTAINERS.NOTE_ATTACHMENTS,
        CONTAINERS.PROFILE_PICTURES,
      ],
      expiresInMinutes: 24 * 60,
    }) || null
  );
}

// GET /api/societies/[id]/governance/storage — storage usage + media list
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Verify membership or super admin
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Get storage settings
    const settings = await query(
      `SELECT COALESCE(storage_quota_bytes, 524288000) AS quota,
              COALESCE(storage_used_bytes, 0) AS used
       FROM society_settings WHERE society_id = $1`,
      [societyId]
    );
    const quota = settings.rows[0]?.quota || 524288000;
    const used = settings.rows[0]?.used || 0;

    // Get all media items (society + event media)
    const [societyMedia, eventMedia] = await Promise.all([
      query(
        `SELECT sm.id, sm.media_type AS category, sm.file_url, sm.file_name,
                sm.file_size_bytes, sm.mime_type, sm.caption, sm.created_at,
                u.full_name AS uploaded_by_name,
                'society' AS source
         FROM society_media sm
         LEFT JOIN users u ON sm.uploaded_by = u.id
         WHERE sm.society_id = $1 AND sm.is_deleted = FALSE
         ORDER BY sm.created_at DESC`,
        [societyId]
      ),
      query(
        `SELECT em.id, em.media_type AS category, em.file_url, em.file_name,
                em.file_size_bytes, em.mime_type, em.caption, em.created_at,
                u.full_name AS uploaded_by_name,
                e.title AS event_title,
                'event' AS source
         FROM event_media em
         JOIN events e ON em.event_id = e.id
         LEFT JOIN users u ON em.uploaded_by = u.id
         WHERE e.society_id = $1 AND em.is_deleted = FALSE
         ORDER BY em.created_at DESC`,
        [societyId]
      ),
    ]);

    const allMedia = [...societyMedia.rows, ...eventMedia.rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({
      used_bytes: Number(used),
      quota_bytes: Number(quota),
      percent_used: quota > 0 ? Number(((Number(used) / Number(quota)) * 100).toFixed(1)) : 0,
      media_items: allMedia.map((m: any) => ({
        id: m.id,
        file_url: signMediaUrl(m.file_url),
        file_name: m.file_name || '',
        file_size: Number(m.file_size_bytes || 0),
        media_type: m.mime_type || '',
        media_table: m.source === 'event' ? 'event_media' : 'society_media',
        uploaded_by_name: m.uploaded_by_name || 'Unknown',
        uploaded_at: m.created_at,
        category: m.category || 'gallery',
      })),
    });
  } catch (error) {
    console.error('Storage error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
