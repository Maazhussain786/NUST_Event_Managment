export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// POST /api/societies/register — register a new society (PENDING_APPROVAL)
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, schoolId, description, contactNumber, presidentName, email,
            category, missionStatement, logoUrl } = body;

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

    // Guard: Prevent user from having multiple pending registrations
    const pendingCheck = await query(
      `SELECT id FROM societies WHERE created_by = $1 AND status = 'PENDING' AND deleted_at IS NULL`,
      [user.userId]
    );
    if (pendingCheck.rows.length > 0) {
      return NextResponse.json(
        { error: 'You already have a pending society registration. Please wait for it to be reviewed.' },
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
         contact_number, president_name, status, category, mission_statement, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10)
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
