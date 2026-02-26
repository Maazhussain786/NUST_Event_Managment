export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/university-events — list NUST official/university events
 * POST /api/admin/university-events — create a new university-level event
 *
 * University events are events created directly by SuperAdmin or flagged
 * as official NUST events. Uses `platform_university_events` table to
 * track metadata (pinned, locked, priority) alongside the events table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_university_events (
        event_id UUID PRIMARY KEY,
        is_pinned BOOLEAN NOT NULL DEFAULT false,
        is_locked BOOLEAN NOT NULL DEFAULT false,
        priority_rank INTEGER NOT NULL DEFAULT 0,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      SELECT e.id, e.title, e.description, e.event_start, e.event_end,
             e.location, e.status, e.banner_url, e.ticket_price,
             e.max_tickets, e.created_at,
             COALESCE(pu.is_pinned, false) AS is_pinned,
             COALESCE(pu.is_locked, false) AS is_locked,
             COALESCE(pu.priority_rank, 0) AS priority_rank,
             u.full_name AS created_by_name,
             s.name AS society_name,
             e.society_id,
             COUNT(DISTINCT er.id) AS registration_count
      FROM events e
      JOIN platform_university_events pu ON pu.event_id = e.id
      LEFT JOIN users u ON u.id = e.created_by
      LEFT JOIN societies s ON s.id = e.society_id
      LEFT JOIN event_registrations er ON er.event_id = e.id AND er.cancelled_at IS NULL
      GROUP BY e.id, pu.is_pinned, pu.is_locked, pu.priority_rank,
               u.full_name, s.name
      ORDER BY pu.priority_rank DESC, e.event_start DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('University events error:', error);
    return NextResponse.json({ error: 'Failed to fetch university events' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ensureTable();

    const {
      title, description, event_start, event_end,
      location, ticket_price, max_tickets, is_pinned, priority_rank,
    } = await req.json();

    if (!title || !event_start) {
      return NextResponse.json({ error: 'title and event_start are required' }, { status: 400 });
    }

    // Find or use the first approved society as host (NUST-wide)
    const nustSociety = await query(
      `SELECT id FROM societies WHERE is_nust_wide = true AND status = 'APPROVED' LIMIT 1`
    );
    const societyId = nustSociety.rows[0]?.id;
    if (!societyId) {
      return NextResponse.json(
        { error: 'No NUST-wide society found. Create one first.' },
        { status: 400 }
      );
    }

    // Create the event
    const eventResult = await query(
      `INSERT INTO events (title, description, event_start, event_end, location,
                           ticket_price, max_tickets, society_id, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'APPROVED')
       RETURNING id`,
      [
        title, description || null, event_start, event_end || null,
        location || null, ticket_price || 0, max_tickets || null,
        societyId, user.userId,
      ]
    );

    const eventId = eventResult.rows[0].id;

    // Mark as university event
    await query(
      `INSERT INTO platform_university_events (event_id, is_pinned, priority_rank, created_by)
       VALUES ($1, $2, $3, $4)`,
      [eventId, is_pinned || false, priority_rank || 0, user.userId]
    );

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'EVENT', $2, $3, $4)`,
      [
        user.userId,
        eventId,
        JSON.stringify({ type: 'UNIVERSITY_EVENT', title }),
        JSON.stringify({ createdBy: user.email, isPinned: is_pinned || false }),
      ]
    );

    return NextResponse.json({ success: true, id: eventId });
  } catch (error) {
    console.error('Create university event error:', error);
    return NextResponse.json({ error: 'Failed to create university event' }, { status: 500 });
  }
}
