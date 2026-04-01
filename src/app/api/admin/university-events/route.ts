export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/university-events — list NUST official/university events
 * POST /api/admin/university-events — create a new university-level event
 *
 * University events are events created directly by SuperAdmin or flagged
 * as official NUST events. Uses `platform_university_events` table to
 * track metadata (pinned, locked, priority) alongside the events table.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, resolveMediaFields } from "@/lib/blob";

function extractMetaImage(html: string): string | null {
  const ogImageMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  if (ogImageMatch?.[1]) return ogImageMatch[1];

  const twitterImageMatch = html.match(
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  if (twitterImageMatch?.[1]) return twitterImageMatch[1];

  return null;
}

async function resolveBannerUrl(input: unknown): Promise<string | null> {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return null;
  }

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; NUST-Events/1.0; +https://nust.edu.pk)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return parsed.toString();
    }

    const contentType = (response.headers.get("content-type") || "")
      .toLowerCase()
      .trim();

    if (contentType.startsWith("image/")) {
      return response.url || parsed.toString();
    }

    if (contentType.includes("text/html")) {
      const html = await response.text();
      const metaImage = extractMetaImage(html);
      if (metaImage) {
        try {
          return new URL(metaImage, parsed.toString()).toString();
        } catch {
          return parsed.toString();
        }
      }
    }

    return parsed.toString();
  } catch {
    return parsed.toString();
  }
}

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

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
              COUNT(DISTINCT t.id) AS registration_count
      FROM events e
      JOIN platform_university_events pu ON pu.event_id = e.id
      LEFT JOIN users u ON u.id = e.created_by
      LEFT JOIN societies s ON s.id = e.society_id
            LEFT JOIN tickets t ON t.event_id = e.id AND t.cancelled_at IS NULL
      GROUP BY e.id, pu.is_pinned, pu.is_locked, pu.priority_rank,
               u.full_name, s.name
      ORDER BY pu.priority_rank DESC, e.event_start DESC
    `);

    const rows = result.rows.map((row) =>
      resolveMediaFields(
        row,
        {
          banner_url: CONTAINERS.EVENT_MEDIA,
        },
        24 * 60,
      ),
    );

    return NextResponse.json(rows);
  } catch (error) {
    console.error("University events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch university events" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureTable();
    await ensureEventCohostsTable();

    const {
      title,
      description,
      event_start,
      event_end,
      location,
      banner_url,
      ticket_price,
      max_tickets,
      is_pinned,
      priority_rank,
      society_id,
      cohost_society_ids,
      include_nust_administration,
    } = await req.json();

    const resolvedBannerUrl = await resolveBannerUrl(banner_url);

    if (!title || !event_start || !event_end) {
      return NextResponse.json(
        { error: "title, event_start and event_end are required" },
        { status: 400 },
      );
    }

    if (new Date(event_end).getTime() <= new Date(event_start).getTime()) {
      return NextResponse.json(
        { error: "event_end must be after event_start" },
        { status: 400 },
      );
    }

    let societyId: string | null = null;

    if (society_id) {
      const selectedSociety = await query(
        `SELECT id
         FROM societies
         WHERE id = $1 AND status = 'APPROVED' AND deleted_at IS NULL
         LIMIT 1`,
        [society_id],
      );

      if (!selectedSociety.rows.length) {
        return NextResponse.json(
          { error: "Selected society is not available for event creation." },
          { status: 400 },
        );
      }

      societyId = selectedSociety.rows[0].id;
    } else {
      // Backward-compatible fallback: first approved NUST-wide society.
      const nustSociety = await query(
        `SELECT id FROM societies WHERE is_nust_wide = true AND status = 'APPROVED' LIMIT 1`,
      );
      societyId = nustSociety.rows[0]?.id || null;
    }

    if (!societyId) {
      return NextResponse.json(
        { error: "No valid host society found. Select an approved society." },
        { status: 400 },
      );
    }

    // Create the event
    const eventResult = await query(
      `INSERT INTO events (title, description, event_start, event_end, location,
                           banner_url, ticket_price, max_tickets, society_id, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APPROVED')
       RETURNING id`,
      [
        title,
        description || null,
        event_start,
        event_end,
        location || null,
        resolvedBannerUrl,
        ticket_price || 0,
        max_tickets || null,
        societyId,
        user.userId,
      ],
    );

    const eventId = eventResult.rows[0].id;

    const uniqueCohostSocietyIds = Array.isArray(cohost_society_ids)
      ? Array.from(
          new Set(
            cohost_society_ids
              .filter((value: unknown): value is string => typeof value === "string")
              .map((value: string) => value.trim())
              .filter((value: string) => value.length > 0 && value !== societyId),
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

    // Mark as university event
    await query(
      `INSERT INTO platform_university_events (event_id, is_pinned, priority_rank, created_by)
       VALUES ($1, $2, $3, $4)`,
      [eventId, is_pinned || false, priority_rank || 0, user.userId],
    );

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'EVENT', $2, $3, $4)`,
      [
        user.userId,
        eventId,
        JSON.stringify({ type: "UNIVERSITY_EVENT", title }),
        JSON.stringify({
          createdBy: user.email,
          isPinned: is_pinned || false,
          include_nust_administration: includeNustAdmin,
          cohost_society_ids: uniqueCohostSocietyIds,
        }),
      ],
    );

    return NextResponse.json({ success: true, id: eventId });
  } catch (error) {
    console.error("Create university event error:", error);
    return NextResponse.json(
      { error: "Failed to create university event" },
      { status: 500 },
    );
  }
}
