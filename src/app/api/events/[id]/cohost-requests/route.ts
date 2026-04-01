export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

async function ensureCohostCore(client: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  await client.query(`
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
      expires_at TIMESTAMPTZ,
      request_type TEXT NOT NULL DEFAULT 'SOCIETY' CHECK (request_type IN ('SOCIETY', 'NUST_ADMIN')),
      cohost_society_id UUID REFERENCES societies(id),
      decided_at TIMESTAMPTZ
    )
  `);

  await client.query(`
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
}

// POST /api/events/[id]/cohost-requests
// Society-side request path. Super admins should directly add co-hosts (no request required).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: eventId } = await params;
    const body = await req.json();
    const requestType =
      body?.request_type === "NUST_ADMIN" ? "NUST_ADMIN" : "SOCIETY";
    const cohostSocietyId =
      typeof body?.cohost_society_id === "string"
        ? body.cohost_society_id.trim()
        : null;
    const reason =
      typeof body?.reason === "string" ? body.reason.trim() || null : null;

    if (requestType === "SOCIETY" && !cohostSocietyId) {
      return NextResponse.json(
        { error: "cohost_society_id is required for SOCIETY requests" },
        { status: 400 },
      );
    }

    await client.query("BEGIN");
    await ensureCohostCore(client);

    const eventResult = await client.query(
      `SELECT e.id, e.title, e.society_id, e.created_by, u.user_type AS created_by_type
       FROM events e
       JOIN users u ON u.id = e.created_by
       WHERE e.id = $1 AND e.deleted_at IS NULL
       FOR UPDATE`,
      [eventId],
    );

    if (eventResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const eventRow = eventResult.rows[0] as {
      title: string;
      society_id: string;
      created_by_type: string;
    };

    if (user.userType === "SUPER_ADMIN") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error:
            "Super admins can add co-hosts directly and do not need to create requests",
        },
        { status: 400 },
      );
    }

    const privilege = await client.query(
      `SELECT fn_has_privilege($1, $2, 'EDIT_EVENT') AS allowed`,
      [user.userId, eventRow.society_id],
    );

    if (!privilege.rows[0]?.allowed) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (requestType === "SOCIETY" && cohostSocietyId === eventRow.society_id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Primary host society is already attached to this event" },
        { status: 409 },
      );
    }

    if (requestType === "SOCIETY") {
      const target = await client.query(
        `SELECT id
         FROM societies
         WHERE id = $1
           AND status = 'APPROVED'
           AND deleted_at IS NULL`,
        [cohostSocietyId],
      );

      if (target.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Requested co-host society is not available" },
          { status: 400 },
        );
      }
    }

    const activeExists = await client.query(
      requestType === "NUST_ADMIN"
        ? `SELECT 1 FROM event_cohosts WHERE event_id = $1 AND cohost_type = 'NUST_ADMIN' AND status = 'ACTIVE' LIMIT 1`
        : `SELECT 1 FROM event_cohosts WHERE event_id = $1 AND cohost_type = 'SOCIETY' AND society_id = $2 AND status = 'ACTIVE' LIMIT 1`,
      requestType === "NUST_ADMIN" ? [eventId] : [eventId, cohostSocietyId],
    );

    if (activeExists.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Selected co-host is already active on this event" },
        { status: 409 },
      );
    }

    const pendingExists = await client.query(
      requestType === "NUST_ADMIN"
        ? `SELECT 1
           FROM platform_cohost_requests
           WHERE event_id = $1
             AND requesting_society_id = $2
             AND request_type = 'NUST_ADMIN'
             AND status = 'PENDING'
           LIMIT 1`
        : `SELECT 1
           FROM platform_cohost_requests
           WHERE event_id = $1
             AND requesting_society_id = $2
             AND request_type = 'SOCIETY'
             AND cohost_society_id = $3
             AND status = 'PENDING'
           LIMIT 1`,
      requestType === "NUST_ADMIN"
        ? [eventId, eventRow.society_id]
        : [eventId, eventRow.society_id, cohostSocietyId],
    );

    if (pendingExists.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "A pending co-host request already exists" },
        { status: 409 },
      );
    }

    const created = await client.query(
      `INSERT INTO platform_cohost_requests (
         event_id,
         requesting_society_id,
         host_society_id,
         requested_by,
         status,
         reason,
         request_type,
         cohost_society_id
       )
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7)
       RETURNING id, status, request_type, cohost_society_id`,
      [
        eventId,
        eventRow.society_id,
        eventRow.society_id,
        user.userId,
        reason,
        requestType,
        requestType === "SOCIETY" ? cohostSocietyId : null,
      ],
    );

    await client.query(
      `INSERT INTO notifications (user_id, title, body, link)
       SELECT id, $1, $2, $3
       FROM users
       WHERE user_type = 'SUPER_ADMIN'`,
      [
        "Co-Host Request Submitted",
        `${user.fullName || "A society member"} submitted a ${requestType === "NUST_ADMIN" ? "NUST Administration" : "society"} co-host request for event \"${eventRow.title}\"`,
        "/platform/cohost-requests",
      ],
    );

    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ('EVENT_UPDATED', $1, $2, 'COHOST_REQUEST', $3, $4, $5)`,
      [
        user.userId,
        eventRow.society_id,
        created.rows[0].id,
        JSON.stringify({
          status: "PENDING",
          request_type: requestType,
          cohost_society_id: requestType === "SOCIETY" ? cohostSocietyId : null,
        }),
        JSON.stringify({
          eventId,
          eventTitle: eventRow.title,
          requestedBy: user.email,
        }),
      ],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        request: created.rows[0],
      },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create co-host request error:", error);
    return NextResponse.json(
      { error: "Failed to create co-host request" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
