export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/api-utils';

// PUT /api/societies/[id]/resubmit — resubmit an INFO_REQUESTED society application
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: max 3 resubmissions per minute
    const rateLimitResponse = checkApiRateLimit(user.userId, 'society-resubmit', 3);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;

    // Verify ownership and status
    const existing = await query(
      `SELECT id, status, created_by FROM societies WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }

    const society = existing.rows[0];

    if (society.created_by !== user.userId) {
      return NextResponse.json({ error: 'You can only resubmit your own society application' }, { status: 403 });
    }

    if (society.status !== 'INFO_REQUESTED') {
      return NextResponse.json(
        { error: 'Only applications with INFO_REQUESTED status can be resubmitted' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, description, contactNumber, presidentName, email, facultySponsorEmail,
            category, missionStatement, logoUrl, facultyAdvisorName, justification,
            bannerUrl } = body;

    if (!name || !description || !presidentName || !email) {
      return NextResponse.json(
        { error: 'Name, description, president name, and email are required' },
        { status: 400 }
      );
    }

    if (name.length > 200) {
      return NextResponse.json({ error: 'Society name too long (max 200 chars)' }, { status: 400 });
    }

    if (description.length > 2000) {
      return NextResponse.json({ error: 'Description too long (max 2000 chars)' }, { status: 400 });
    }

    if (justification && justification.length > 2000) {
      return NextResponse.json({ error: 'Justification too long (max 2000 chars)' }, { status: 400 });
    }

    // Check name uniqueness (excluding this society and rejected ones)
    const nameCheck = await query(
      `SELECT id FROM societies WHERE LOWER(name) = LOWER($1) AND id != $2 AND status != 'REJECTED' AND deleted_at IS NULL`,
      [name, id]
    );
    if (nameCheck.rows.length > 0) {
      return NextResponse.json({ error: 'A society with this name already exists' }, { status: 409 });
    }

    // Update society and set status back to PENDING
    await query(
      `UPDATE societies SET
         name = $1, description = $2, school_id = COALESCE($3::uuid, (SELECT id FROM nust_schools WHERE abbreviation = 'SEECS')),
         is_nust_wide = FALSE, faculty_sponsor_email = COALESCE($4, faculty_sponsor_email),
         contact_number = $5, president_name = $6, category = $7,
         mission_statement = $8, faculty_advisor_name = $9, justification = $10,
         contact_email = $11, status = 'PENDING', admin_message = NULL,
         logo_url = COALESCE($12, logo_url),
         banner_url = COALESCE($13, banner_url),
         updated_at = NOW()
       WHERE id = $14`,
      [
        name.trim(),
        description.trim(),
        null,
        facultySponsorEmail ? String(facultySponsorEmail).trim().toLowerCase() : null,
        contactNumber || null,
        presidentName.trim(),
        category || null,
        missionStatement?.trim() || null,
        facultyAdvisorName?.trim() || null,
        justification?.trim() || null,
        email.trim(),
        logoUrl || null,
        bannerUrl || null,
        id,
      ]
    );

    // Log the state change
    await query(
      `INSERT INTO society_state_changes (society_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'INFO_REQUESTED', 'PENDING', $2, 'Applicant resubmitted with updated information')`,
      [id, user.userId]
    );

    // Notify super admins
    await query(
      `INSERT INTO notifications (user_id, title, body, link)
       SELECT id, $1, $2, $3 FROM users WHERE user_type = 'SUPER_ADMIN'`,
      [
        'Society Application Updated',
        `${presidentName} resubmitted "${name}" with updated information`,
        '/platform/societies',
      ]
    );

    return NextResponse.json({ id, status: 'PENDING' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Resubmission failed';
    console.error('Society resubmit error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
