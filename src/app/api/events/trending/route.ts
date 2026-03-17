export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const result = await query(
      `SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.ticket_price, e.max_tickets, e.is_paid,
              ec.name AS category_name,
              s.id AS society_id, s.name AS society_name, s.logo_url AS society_logo,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
       FROM events e
       LEFT JOIN event_categories ec ON e.category_id = ec.id
       JOIN societies s ON e.society_id = s.id
       LEFT JOIN tickets t ON e.id = t.event_id
       WHERE e.is_cancelled = FALSE AND e.deleted_at IS NULL AND e.event_end >= NOW()
       GROUP BY e.id, ec.name, s.id
       ORDER BY tickets_sold DESC, e.event_start ASC
       LIMIT 10`
    );

    return NextResponse.json({ events: result.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch trending events';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
