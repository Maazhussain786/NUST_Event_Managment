import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [users, societies, events, pendingEvents, pendingSocieties] = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM societies WHERE status = $1', ['APPROVED']),
      query('SELECT COUNT(*) as count FROM events'),
      query('SELECT COUNT(*) as count FROM events WHERE status = $1', ['PENDING']),
      query('SELECT COUNT(*) as count FROM societies WHERE status = $1', ['PENDING']),
    ]);

    return NextResponse.json({
      totalUsers: parseInt(users.rows[0].count),
      totalSocieties: parseInt(societies.rows[0].count),
      totalEvents: parseInt(events.rows[0].count),
      pendingEvents: parseInt(pendingEvents.rows[0].count),
      pendingSocieties: parseInt(pendingSocieties.rows[0].count),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
