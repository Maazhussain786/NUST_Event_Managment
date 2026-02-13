import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || new Date().toISOString().split('T')[0];
    const days = parseInt(searchParams.get('days') || '30');

    const toDate = new Date(from);
    toDate.setDate(toDate.getDate() + days);

    const result = await query(
      `SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.ticket_price, e.is_paid,
              DATE(e.event_start) AS event_date,
              ec.name AS category_name,
              s.id AS society_id, s.name AS society_name, s.logo_url AS society_logo
       FROM events e
       LEFT JOIN event_categories ec ON e.category_id = ec.id
       JOIN societies s ON e.society_id = s.id
       WHERE e.is_cancelled = FALSE
         AND DATE(e.event_start) >= $1
         AND DATE(e.event_start) <= $2
       ORDER BY e.event_start ASC`,
      [from, toDate.toISOString().split('T')[0]]
    );

    // Group events by date
    const grouped: Record<string, typeof result.rows> = {};
    const dates: string[] = [];

    result.rows.forEach((event) => {
      const date = event.event_date;
      if (!grouped[date]) {
        grouped[date] = [];
        dates.push(date);
      }
      grouped[date].push(event);
    });

    return NextResponse.json({ dates, events: grouped, total: result.rows.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch timeline';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
