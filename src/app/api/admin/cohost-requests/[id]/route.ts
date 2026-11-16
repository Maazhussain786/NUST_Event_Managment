export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/cohost-requests/[id] — approve or reject a co-host request
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

async function ensureCohostTables() {
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

  await query(`
    ALTER TABLE platform_cohost_requests
    ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'SOCIETY'
      CHECK (request_type IN ('SOCIETY', 'NUST_ADMIN')),
    ADD COLUMN IF NOT EXISTS cohost_society_id UUID REFERENCES societies(id),
    ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ
  `);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { action, admin_note } = await req.json();

    await ensureCohostTables();

    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return NextResponse.json({ error: 'action must be APPROVED or REJECTED' }, { status: 400 });
    }

    await query(
      `UPDATE platform_cohost_requests
       SET status = $1, admin_note = $2, approved_by = $3, decided_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [action, admin_note || null, user.userId, id]
    );

    if (action === 'APPROVED') {
      const requestDetails = await query(
        `SELECT event_id, request_type, cohost_society_id
         FROM platform_cohost_requests
         WHERE id = $1`,
        [id],
      );

      const requestRow = requestDetails.rows[0];
      if (requestRow) {
        if (requestRow.request_type === 'NUST_ADMIN') {
          await query(
            `INSERT INTO event_cohosts (event_id, cohost_type, society_id, status, source_request_id, added_by)
             VALUES ($1, 'NUST_ADMIN', NULL, 'ACTIVE', $2, $3)
             ON CONFLICT DO NOTHING`,
            [requestRow.event_id, id, user.userId],
          );
        } else if (requestRow.cohost_society_id) {
          await query(
            `INSERT INTO event_cohosts (event_id, cohost_type, society_id, status, source_request_id, added_by)
             VALUES ($1, 'SOCIETY', $2, 'ACTIVE', $3, $4)
             ON CONFLICT DO NOTHING`,
            [requestRow.event_id, requestRow.cohost_society_id, id, user.userId],
          );
        }
      }
    }

    // Get request details for audit
    const reqDetail = await query(
      `SELECT cr.event_id, e.title, rs.name AS requesting,
              COALESCE(cs.name, CASE WHEN cr.request_type = 'NUST_ADMIN' THEN 'SEECS Administration' ELSE hs.name END) AS host
       FROM platform_cohost_requests cr
       JOIN events e ON e.id = cr.event_id
       JOIN societies rs ON rs.id = cr.requesting_society_id
       JOIN societies hs ON hs.id = cr.host_society_id
       LEFT JOIN societies cs ON cs.id = cr.cohost_society_id
       WHERE cr.id = $1`,
      [id]
    );

    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'COHOST_REQUEST', $2, $3, $4)`,
      [
        user.userId,
        id,
        JSON.stringify({ status: action }),
        JSON.stringify({
          decision: action,
          admin_note: admin_note || '',
          event: reqDetail.rows[0]?.title || '',
          decidedBy: user.email,
        }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Co-host request update error:', error);
    return NextResponse.json({ error: 'Failed to update co-host request' }, { status: 500 });
  }
}
