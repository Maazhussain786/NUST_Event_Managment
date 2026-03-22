export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTAINERS, extractBlobName, generateReadUrl } from '@/lib/blob';

function signMediaUrl(url: string | null | undefined): string | null | undefined {
  if (!url) return url;

  const candidates = [
    CONTAINERS.EVENT_MEDIA,
    CONTAINERS.SOCIETY_MEDIA,
    CONTAINERS.PROFILE_PICTURES,
    CONTAINERS.POST_ATTACHMENTS,
    CONTAINERS.NOTE_ATTACHMENTS,
  ];

  for (const container of candidates) {
    const blobName = extractBlobName(url, container);
    if (blobName) {
      return generateReadUrl(container, blobName, 24 * 60);
    }
  }

  return url;
}

// GET /api/societies/[id]/governance/events — list society events with optional status filter
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

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let sql = `
            SELECT e.id, e.title, e.description,
              e.location AS venue, e.venue_details,
             e.event_start, e.event_end, e.status, e.is_paid, e.ticket_price,
             e.max_participants, e.participants_count, e.banner_url, e.thumbnail_url,
              e.visibility, e.registration_link, e.registration_end AS registration_deadline, e.created_at,
             u.full_name AS created_by_name,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold,
             COUNT(DISTINCT er.id) FILTER (WHERE er.cancelled_at IS NULL) AS registrations
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN tickets t ON e.id = t.event_id
      LEFT JOIN event_registrations er ON e.id = er.event_id
      WHERE e.society_id = $1
    `;
    const qParams: unknown[] = [societyId];

    if (status && status !== 'ALL') {
      qParams.push(status);
      sql += ` AND e.status = $${qParams.length}`;
    }

    sql += ` GROUP BY e.id, u.full_name ORDER BY e.event_start DESC`;

    const result = await query(sql, qParams);
    const rows = result.rows.map((row) => ({
      ...row,
      banner_url: signMediaUrl(row.banner_url),
      thumbnail_url: signMediaUrl(row.thumbnail_url),
    }));

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Governance events error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
