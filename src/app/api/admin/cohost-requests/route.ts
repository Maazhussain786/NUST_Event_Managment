export const dynamic = 'force-dynamic';

/**
 * GET   /api/admin/cohost-requests — list all co-host requests
 * PATCH /api/admin/cohost-requests — (unused, use /[id])
 *
 * Co-host requests allow one society to request co-hosting an event
 * with another society. SuperAdmin can view and manage these.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_cohost_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL REFERENCES events(id),
        requesting_society_id UUID NOT NULL REFERENCES societies(id),
        host_society_id UUID NOT NULL REFERENCES societies(id),
        requested_by UUID NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'PENDING',
        reason TEXT,
        admin_note TEXT,
        approved_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      )
    `);

    await query(`
      ALTER TABLE platform_cohost_requests
      ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'SOCIETY'
        CHECK (request_type IN ('SOCIETY', 'NUST_ADMIN')),
      ADD COLUMN IF NOT EXISTS cohost_society_id UUID REFERENCES societies(id),
      ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS event_cohosts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        cohost_type TEXT NOT NULL CHECK (cohost_type IN ('SOCIETY', 'NUST_ADMIN')),
        society_id UUID REFERENCES societies(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
        source_request_id UUID REFERENCES platform_cohost_requests(id) ON DELETE SET NULL,
        added_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_event_cohosts_society_required
          CHECK (
            (cohost_type = 'SOCIETY' AND society_id IS NOT NULL)
            OR
            (cohost_type = 'NUST_ADMIN' AND society_id IS NULL)
          )
      )
    `);
  } catch {
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tableReady = await ensureTable();
    if (!tableReady) return NextResponse.json([]);

    const status = req.nextUrl.searchParams.get('status');

    let whereClause = '';
    const params: string[] = [];
    if (status) {
      whereClause = 'WHERE cr.status = $1';
      params.push(status);
    }

    const result = await query(
      `SELECT cr.id, cr.event_id, e.title AS event_title,
              cr.requesting_society_id, rs.name AS requesting_society_name,
        cr.host_society_id,
        cr.request_type,
        cr.cohost_society_id,
        COALESCE(cs.name, CASE WHEN cr.request_type = 'NUST_ADMIN' THEN 'NUST Administration' ELSE hs.name END) AS host_society_name,
              u.full_name AS requested_by_name,
              cr.status, cr.reason, cr.admin_note,
              cr.created_at, cr.updated_at, cr.expires_at
       FROM platform_cohost_requests cr
       JOIN events e ON e.id = cr.event_id
       JOIN societies rs ON rs.id = cr.requesting_society_id
       JOIN societies hs ON hs.id = cr.host_society_id
      LEFT JOIN societies cs ON cs.id = cr.cohost_society_id
       LEFT JOIN users u ON u.id = cr.requested_by
       ${whereClause}
       ORDER BY
         CASE cr.status WHEN 'PENDING' THEN 0 ELSE 1 END,
         cr.created_at DESC
       LIMIT 100`,
      params
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Co-host requests error:', error);
    return NextResponse.json({ error: 'Failed to fetch co-host requests' }, { status: 500 });
  }
}
