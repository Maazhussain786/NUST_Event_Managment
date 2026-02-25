/**
 * GET  /api/admin/notifications — list all platform notifications
 * POST /api/admin/notifications — create a new notification broadcast
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'NORMAL',
        target_type TEXT NOT NULL DEFAULT 'ALL',
        target_id UUID,
        scheduled_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS platform_notification_reads (
        notification_id UUID NOT NULL REFERENCES platform_notifications(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (notification_id, user_id)
      )
    `);
  } catch {
    return false;
  }
  return true;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tableReady = await ensureTable();
    if (!tableReady) return NextResponse.json([]);

    const result = await query(`
      SELECT pn.id, pn.title, pn.body, pn.priority,
             pn.target_type, pn.target_id,
             CASE
               WHEN pn.target_type = 'SOCIETY' THEN s.name
               WHEN pn.target_type = 'EVENT' THEN e.title
               WHEN pn.target_type = 'USER' THEN u2.full_name
               ELSE 'All Users'
             END AS target_label,
             pn.scheduled_at, pn.expires_at, pn.is_active,
             COUNT(DISTINCT pnr.user_id) AS read_count,
             CASE
               WHEN pn.target_type = 'ALL' THEN (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE')
               WHEN pn.target_type = 'SOCIETY' THEN (
                 SELECT COUNT(*) FROM society_memberships WHERE society_id = pn.target_id AND is_active = true
               )
               WHEN pn.target_type = 'USER' THEN 1
               ELSE 0
             END AS total_target,
             uc.full_name AS sender_name,
             pn.created_at
      FROM platform_notifications pn
      LEFT JOIN platform_notification_reads pnr ON pnr.notification_id = pn.id
      LEFT JOIN users uc ON uc.id = pn.created_by
      LEFT JOIN societies s ON s.id = pn.target_id AND pn.target_type = 'SOCIETY'
      LEFT JOIN events e ON e.id = pn.target_id AND pn.target_type = 'EVENT'
      LEFT JOIN users u2 ON u2.id = pn.target_id AND pn.target_type = 'USER'
      GROUP BY pn.id, s.name, e.title, u2.full_name, uc.full_name
      ORDER BY pn.created_at DESC
      LIMIT 100
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Notifications error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ensureTable();

    const { title, body, priority, target_type, target_id, scheduled_at, expires_at } = await req.json();

    if (!title || !body) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }

    const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    const validTargets = ['ALL', 'SOCIETY', 'EVENT', 'USER'];

    const result = await query(
      `INSERT INTO platform_notifications
         (title, body, priority, target_type, target_id, scheduled_at, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        title,
        body,
        validPriorities.includes(priority) ? priority : 'NORMAL',
        validTargets.includes(target_type) ? target_type : 'ALL',
        target_id || null,
        scheduled_at || null,
        expires_at || null,
        user.userId,
      ]
    );

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'NOTIFICATION', $2, $3, $4)`,
      [
        user.userId,
        result.rows[0].id,
        JSON.stringify({ title, priority: priority || 'NORMAL' }),
        JSON.stringify({ sentBy: user.email, target_type: target_type || 'ALL' }),
      ]
    );

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Create notification error:', error);
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  }
}
