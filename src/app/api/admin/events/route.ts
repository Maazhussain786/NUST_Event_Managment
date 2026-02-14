import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/admin/events?status=PENDING
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status') || 'PENDING';

    const result = await query(
      `SELECT e.id, e.title, e.description, e.event_start AS start_date,
              e.event_end AS end_date, e.location AS venue,
              e.status, e.max_tickets AS capacity, e.ticket_price,
              e.banner_url, e.created_at,
              s.name as society_name, s.logo_url as society_logo,
              u.full_name as created_by_name
       FROM events e
       JOIN societies s ON s.id = e.society_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.status = $1
       ORDER BY e.created_at DESC`,
      [status]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Admin events error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
