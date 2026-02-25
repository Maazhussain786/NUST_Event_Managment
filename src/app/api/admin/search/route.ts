/**
 * GET /api/admin/search?q=term — global search across users, societies, events, audit logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = req.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({
        users: [],
        societies: [],
        events: [],
        auditLogs: [],
      });
    }

    const pattern = `%${q}%`;

    const [users, societies, events, auditLogs] = await Promise.all([
      query(
        `SELECT id, 'user' AS type,
                full_name AS title,
                email AS subtitle,
                status,
                created_at
         FROM users
         WHERE full_name ILIKE $1 OR email ILIKE $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [pattern]
      ),
      query(
        `SELECT id, 'society' AS type,
                name AS title,
                description AS subtitle,
                status,
                created_at
         FROM societies
         WHERE name ILIKE $1 OR description ILIKE $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [pattern]
      ),
      query(
        `SELECT id, 'event' AS type,
                title,
                description AS subtitle,
                status,
                created_at
         FROM events
         WHERE title ILIKE $1 OR description ILIKE $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [pattern]
      ),
      query(
        `SELECT al.id, 'audit_log' AS type,
                al.action AS title,
                u.full_name AS subtitle,
                NULL AS status,
                al.created_at
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.performed_by
         WHERE al.action::text ILIKE $1
            OR u.full_name ILIKE $1
         ORDER BY al.created_at DESC
         LIMIT 10`,
        [pattern]
      ),
    ]);

    return NextResponse.json({
      users: users.rows,
      societies: societies.rows,
      events: events.rows,
      auditLogs: auditLogs.rows,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
