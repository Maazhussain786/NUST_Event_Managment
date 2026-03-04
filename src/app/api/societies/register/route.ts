export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/api-utils';

// POST /api/societies/register — register a new society (PENDING_APPROVAL)
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: max 3 registration attempts per minute
    const rateLimitResponse = checkApiRateLimit(user.userId, 'society-register', 3);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json();
    const { name, schoolId, description, contactNumber, presidentName, email,
            category, missionStatement, logoUrl, facultyAdvisorName, justification,
            bannerUrl } = body;

    if (!name || !description || !presidentName || !email) {
      return NextResponse.json(
        { error: 'Name, description, president name, and email are required' },
        { status: 400 }
      );
    }

    // Validate name length
    if (name.length > 200) {
      return NextResponse.json({ error: 'Society name too long (max 200 chars)' }, { status: 400 });
    }

    // Validate description length
    if (description.length > 2000) {
      return NextResponse.json({ error: 'Description too long (max 2000 chars)' }, { status: 400 });
    }

    // Validate justification length
    if (justification && justification.length > 2000) {
      return NextResponse.json({ error: 'Justification too long (max 2000 chars)' }, { status: 400 });
    }

    // Guard: Prevent user from having multiple pending registrations
    const pendingCheck = await query(
      `SELECT id FROM societies WHERE created_by = $1 AND status IN ('PENDING', 'INFO_REQUESTED') AND deleted_at IS NULL`,
      [user.userId]
    );
    if (pendingCheck.rows.length > 0) {
      return NextResponse.json(
        { error: 'You already have a pending society registration. Please wait for it to be reviewed.' },
        { status: 409 }
      );
    }

    // Guard: Prevent user who is already an active president from registering another society
    const activePresidency = await query(
      `SELECT sm.id FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       JOIN societies s ON sm.society_id = s.id
       WHERE sm.user_id = $1
         AND r.name = 'President'
         AND sm.is_active = TRUE
         AND s.status = 'APPROVED'
         AND s.deleted_at IS NULL`,
      [user.userId]
    );
    if (activePresidency.rows.length > 0) {
      return NextResponse.json(
        { error: 'You are already the president of an active society. Transfer presidency first before registering a new society.' },
        { status: 409 }
      );
    }

    // Check if society with same name already exists
    const existing = await query(
      'SELECT id FROM societies WHERE LOWER(name) = LOWER($1) AND status != $2 AND deleted_at IS NULL',
      [name, 'REJECTED']
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'A society with this name already exists' },
        { status: 409 }
      );
    }

    // Create society with PENDING status
    const result = await query(
      `INSERT INTO societies (name, description, school_id, is_nust_wide, created_by,
         contact_number, president_name, status, category, mission_statement, logo_url,
         faculty_advisor_name, justification, banner_url, contact_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        name.trim(),
        description.trim(),
        schoolId || null,
        !schoolId, // nust_wide if no school selected
        user.userId,
        contactNumber || null,
        presidentName.trim(),
        category || null,
        missionStatement?.trim() || null,
        logoUrl || null,
        facultyAdvisorName?.trim() || null,
        justification?.trim() || null,
        bannerUrl || null,
        email.trim(),
      ]
    );

    const societyId = result.rows[0].id;

    // Notify super admins
    await query(
      `INSERT INTO notifications (user_id, title, body, link)
       SELECT id, $1, $2, $3 FROM users WHERE user_type = 'SUPER_ADMIN'`,
      [
        'New Society Application',
        `${presidentName} applied to register "${name}"${category ? ` (${category})` : ''}`,
        '/platform/societies',
      ]
    );

    return NextResponse.json({ id: societyId, status: 'PENDING' }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    console.error('Society registration error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
