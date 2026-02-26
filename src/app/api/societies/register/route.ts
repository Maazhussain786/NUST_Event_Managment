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
    const { name, schoolId, description, contactNumber, presidentName, email } = body;

    if (!name || !description || !presidentName || !email) {
      return NextResponse.json(
        { error: 'Name, description, president name, and email are required' },
        { status: 400 }
      );
    }

    // Check if society with same name already exists
    const existing = await query(
      'SELECT id FROM societies WHERE LOWER(name) = LOWER($1) AND status != $2',
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
         contact_number, president_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
       RETURNING id`,
      [
        name,
        description,
        schoolId || null,
        !schoolId, // nust_wide if no school selected
        user.userId,
        contactNumber || null,
        presidentName,
      ]
    );

    const societyId = result.rows[0].id;

    // Notify super admins
    await query(
      `INSERT INTO notifications (user_id, title, body, link)
       SELECT id, $1, $2, $3 FROM users WHERE user_type = 'SUPER_ADMIN'`,
      [
        'New Society Application',
        `${presidentName} applied to register "${name}"`,
        '/admin',
      ]
    );

    return NextResponse.json({ id: societyId, status: 'PENDING' }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    console.error('Society registration error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
