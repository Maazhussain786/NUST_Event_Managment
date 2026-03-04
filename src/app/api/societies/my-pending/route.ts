export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/my-pending — get current user's pending/info-requested society application
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query(
      `SELECT id, name, description, school_id, is_nust_wide, category, mission_statement,
              contact_number, president_name, contact_email, faculty_advisor_name,
              justification, admin_message, status, logo_url, banner_url
       FROM societies
       WHERE created_by = $1 AND status IN ('PENDING', 'INFO_REQUESTED') AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ society: null });
    }

    return NextResponse.json({ society: result.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed';
    console.error('My pending society error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
