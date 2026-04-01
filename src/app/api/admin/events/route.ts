export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, resolveMediaFields } from "@/lib/blob";

async function ensurePlatformEventControlsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS platform_event_controls (
      event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureEventCohostsTable() {
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
}

// GET /api/admin/events?status=PENDING
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensurePlatformEventControlsTable();

    const status = req.nextUrl.searchParams.get("status") || "PENDING";

    let whereClause = "WHERE e.deleted_at IS NULL";
    const params: string[] = [];
    if (status !== "ALL") {
      whereClause += " AND e.status = $1";
      params.push(status);
    }

    const result = await query(
      `SELECT e.id, e.title, e.description, e.event_start AS start_date,
              e.event_end AS end_date, e.location AS venue,
              e.status, e.max_tickets AS capacity, e.ticket_price,
          e.banner_url, e.created_at,
          COALESCE(pec.is_pinned, FALSE) AS is_pinned,
              s.name as society_name, s.logo_url as society_logo,
              u.full_name as created_by_name
       FROM events e
       JOIN societies s ON s.id = e.society_id
       LEFT JOIN users u ON u.id = e.created_by
        LEFT JOIN platform_event_controls pec ON pec.event_id = e.id
       ${whereClause}
        ORDER BY COALESCE(pec.is_pinned, FALSE) DESC, e.created_at DESC
       LIMIT 200`,
      params,
    );

    const rows = result.rows.map((row) =>
      resolveMediaFields(
        row,
        {
          banner_url: CONTAINERS.EVENT_MEDIA,
          society_logo: CONTAINERS.SOCIETY_MEDIA,
        },
        24 * 60,
      ),
    );

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Admin events error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/admin/events — create platform event (super admin)
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const {
      title,
      description,
      event_start,
      event_end,
      location,
      ticket_price,
      max_tickets,
      society_id,
      is_pinned,
      cohost_society_ids,
      include_nust_administration,
    } = await req.json();

    await ensurePlatformEventControlsTable();
    await ensureEventCohostsTable();

    if (!title || !event_start || !event_end || !society_id) {
      return NextResponse.json(
        { error: "title, event_start, event_end and society_id are required" },
        { status: 400 },
      );
    }

    if (new Date(event_end).getTime() <= new Date(event_start).getTime()) {
      return NextResponse.json(
        { error: "event_end must be after event_start" },
        { status: 400 },
      );
    }

    const societyCheck = await query(
      `SELECT id FROM societies
       WHERE id = $1 AND status = 'APPROVED' AND deleted_at IS NULL
       LIMIT 1`,
      [society_id],
    );
    if (!societyCheck.rows.length) {
      return NextResponse.json(
        { error: "Selected society is not available for event creation" },
        { status: 400 },
      );
    }

    const normalizedPrice = Number(ticket_price || 0);
    const normalizedMaxTickets =
      max_tickets === undefined || max_tickets === null || max_tickets === ""
        ? null
        : Number(max_tickets);

    const created = await query(
      `INSERT INTO events (
        society_id, title, description, location,
        is_paid, ticket_price, max_tickets,
        event_start, event_end, created_by, status, is_cancelled
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, 'APPROVED', FALSE
      )
      RETURNING id`,
      [
        society_id,
        String(title).trim(),
        description ? String(description).trim() : null,
        location ? String(location).trim() : null,
        normalizedPrice > 0,
        normalizedPrice,
        normalizedMaxTickets,
        event_start,
        event_end,
        user.userId,
      ],
    );

    const eventId = created.rows[0]?.id;

    const uniqueCohostSocietyIds = Array.isArray(cohost_society_ids)
      ? Array.from(
          new Set(
            cohost_society_ids
              .filter((value: unknown): value is string => typeof value === "string")
              .map((value: string) => value.trim())
              .filter((value: string) => value.length > 0 && value !== society_id),
          ),
        )
      : [];

    if (uniqueCohostSocietyIds.length > 0) {
      const validCohostSocieties = await query(
        `SELECT id
         FROM societies
         WHERE id = ANY($1::uuid[])
           AND status = 'APPROVED'
           AND deleted_at IS NULL`,
        [uniqueCohostSocietyIds],
      );

      for (const row of validCohostSocieties.rows) {
        await query(
          `INSERT INTO event_cohosts (event_id, cohost_type, society_id, status, added_by)
           VALUES ($1, 'SOCIETY', $2, 'ACTIVE', $3)
           ON CONFLICT DO NOTHING`,
          [eventId, row.id, user.userId],
        );
      }
    }

    const includeNustAdmin =
      include_nust_administration === undefined
        ? true
        : Boolean(include_nust_administration);

    if (includeNustAdmin) {
      await query(
        `INSERT INTO event_cohosts (event_id, cohost_type, society_id, status, added_by)
         VALUES ($1, 'NUST_ADMIN', NULL, 'ACTIVE', $2)
         ON CONFLICT DO NOTHING`,
        [eventId, user.userId],
      );
    }

    await query(
      `INSERT INTO platform_event_controls (event_id, is_pinned, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id)
       DO UPDATE SET is_pinned = EXCLUDED.is_pinned, updated_at = NOW()`,
      [eventId, Boolean(is_pinned), user.userId],
    );

    await query(
      `INSERT INTO audit_logs (performed_by, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        "EVENT_CREATED",
        "EVENT",
        eventId,
        JSON.stringify({
          source: "SUPER_ADMIN_PLATFORM_EVENTS",
          society_id,
          title: String(title).trim(),
          include_nust_administration: includeNustAdmin,
          cohost_society_ids: uniqueCohostSocietyIds,
        }),
      ],
    );

    return NextResponse.json({ success: true, id: eventId });
  } catch (error) {
    console.error("Admin event create error:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }
}
