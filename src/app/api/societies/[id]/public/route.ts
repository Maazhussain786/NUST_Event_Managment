export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/societies/[id]/public — public society profile (no auth)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Society core
    const societyResult = await query(
      `SELECT s.id, s.name, s.description, s.logo_url, s.status,
              s.is_nust_wide, s.created_at,
              ns.full_name AS school_name, ns.abbreviation AS school_abbr,
              COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count,
              COALESCE(AVG(r.score), 0)::numeric(3,2) AS avg_rating,
              COUNT(DISTINCT r.id) AS rating_count
       FROM societies s
       LEFT JOIN nust_schools ns ON s.school_id = ns.id
       LEFT JOIN society_memberships sm ON s.id = sm.society_id AND sm.is_active = TRUE
       LEFT JOIN ratings r ON r.target_type = 'SOCIETY' AND r.target_id = s.id
       WHERE s.id = $1 AND s.status = 'APPROVED'
       GROUP BY s.id, ns.full_name, ns.abbreviation`,
      [id]
    );

    if (societyResult.rows.length === 0) {
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }

    // Profile branding (may not exist yet)
    const profileResult = await query(
      `SELECT tagline, cover_url, mission, established_year, faculty_advisor,
              contact_email, contact_phone, office_location, social_links,
              primary_color, accent_color, pin_announcement, featured_event_id, is_public
       FROM society_profiles WHERE society_id = $1`,
      [id]
    );

    const profile = profileResult.rows[0] || null;

    // If profile exists and is_public = false, deny access
    if (profile && profile.is_public === false) {
      return NextResponse.json({ error: 'This society page is private' }, { status: 403 });
    }

    // Upcoming public events (max 12)
    const eventsResult = await query(
      `SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.ticket_price, e.visibility,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
       FROM events e
       LEFT JOIN tickets t ON e.id = t.event_id
       WHERE e.society_id = $1 AND e.is_cancelled = FALSE
             AND e.visibility = 'PUBLIC'
       GROUP BY e.id
       ORDER BY e.event_start DESC
       LIMIT 12`,
      [id]
    );

    // Team — public members (leadership roles only for public display)
    const teamResult = await query(
      `SELECT sm.id AS membership_id, u.id AS user_id, u.full_name, u.avatar_url,
              r.name AS role_name, r.hierarchy_level,
              w.name AS wing_name, p.name AS portfolio_name
       FROM society_memberships sm
       JOIN users u ON sm.user_id = u.id
       JOIN roles r ON sm.role_id = r.id
       LEFT JOIN wings w ON sm.wing_id = w.id
       LEFT JOIN portfolios p ON sm.portfolio_id = p.id
       WHERE sm.society_id = $1 AND sm.is_active = TRUE AND r.hierarchy_level >= 3
       ORDER BY r.hierarchy_level DESC, u.full_name ASC`,
      [id]
    );

    // Gallery — public content
    const galleryResult = await query(
      `SELECT c.id, c.title, c.description, c.file_url, c.file_type,
              c.created_at, u.full_name AS uploaded_by
       FROM content c
       JOIN users u ON c.uploaded_by = u.id
       WHERE c.society_id = $1 AND c.scope = 'SOCIETY'
       ORDER BY c.created_at DESC
       LIMIT 24`,
      [id]
    );

    // Wings
    const wingsResult = await query(
      `SELECT w.id, w.name, w.description,
              COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count
       FROM wings w
       LEFT JOIN society_memberships sm ON sm.wing_id = w.id AND sm.is_active = TRUE
       WHERE w.society_id = $1
       GROUP BY w.id
       ORDER BY w.name`,
      [id]
    );

    return NextResponse.json({
      society: societyResult.rows[0],
      profile,
      events: eventsResult.rows,
      team: teamResult.rows,
      gallery: galleryResult.rows,
      wings: wingsResult.rows,
    });
  } catch (error: unknown) {
    console.error('Public society fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch society' }, { status: 500 });
  }
}
