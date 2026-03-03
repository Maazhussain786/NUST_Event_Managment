export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/profile — get society profile (branding)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;

    // Verify membership
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, id]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const result = await query(
      `SELECT * FROM society_profiles WHERE society_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return NextResponse.json({
        society_id: id,
        tagline: null,
        cover_url: null,
        mission: null,
        established_year: null,
        faculty_advisor: null,
        contact_email: null,
        contact_phone: null,
        office_location: null,
        social_links: {},
        primary_color: '#FF9F43',
        accent_color: null,
        ticket_footer_text: null,
        is_public: true,
        member_approval: false,
        auto_approve_ticket: false,
        pin_announcement: null,
        featured_event_id: null,
      });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PATCH /api/societies/[id]/profile — update society profile (President only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;

    // Check user is President or Super Admin
    const membership = await query(
      `SELECT r.name, r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, id]
    );
    const isPresident = membership.rows.some((m: any) => m.name === 'President');
    if (!isPresident && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only the President can update profile' }, { status: 403 });
    }

    const body = await req.json();
    const {
      tagline, cover_url, mission, established_year, faculty_advisor,
      contact_email, contact_phone, office_location, social_links,
      primary_color, accent_color, ticket_footer_text,
      is_public, member_approval, auto_approve_ticket,
      pin_announcement, featured_event_id,
    } = body;

    const result = await query(
      `INSERT INTO society_profiles (
        society_id, tagline, cover_url, mission, established_year, faculty_advisor,
        contact_email, contact_phone, office_location, social_links,
        primary_color, accent_color, ticket_footer_text,
        is_public, member_approval, auto_approve_ticket,
        pin_announcement, featured_event_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (society_id) DO UPDATE SET
        tagline = COALESCE($2, society_profiles.tagline),
        cover_url = COALESCE($3, society_profiles.cover_url),
        mission = COALESCE($4, society_profiles.mission),
        established_year = COALESCE($5, society_profiles.established_year),
        faculty_advisor = COALESCE($6, society_profiles.faculty_advisor),
        contact_email = COALESCE($7, society_profiles.contact_email),
        contact_phone = COALESCE($8, society_profiles.contact_phone),
        office_location = COALESCE($9, society_profiles.office_location),
        social_links = COALESCE($10, society_profiles.social_links),
        primary_color = COALESCE($11, society_profiles.primary_color),
        accent_color = COALESCE($12, society_profiles.accent_color),
        ticket_footer_text = COALESCE($13, society_profiles.ticket_footer_text),
        is_public = COALESCE($14, society_profiles.is_public),
        member_approval = COALESCE($15, society_profiles.member_approval),
        auto_approve_ticket = COALESCE($16, society_profiles.auto_approve_ticket),
        pin_announcement = COALESCE($17, society_profiles.pin_announcement),
        featured_event_id = $18,
        updated_at = NOW()
      RETURNING *`,
      [
        id, tagline ?? null, cover_url ?? null, mission ?? null,
        established_year ?? null, faculty_advisor ?? null,
        contact_email ?? null, contact_phone ?? null,
        office_location ?? null, social_links ? JSON.stringify(social_links) : null,
        primary_color ?? null, accent_color ?? null, ticket_footer_text ?? null,
        is_public ?? true, member_approval ?? false, auto_approve_ticket ?? false,
        pin_announcement ?? null, featured_event_id ?? null,
      ]
    );

    return NextResponse.json({ success: true, profile: result.rows[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
