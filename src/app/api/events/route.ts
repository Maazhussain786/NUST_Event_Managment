export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { CONTAINERS, resolveMediaFields } from "@/lib/blob";

export async function GET(req: Request) {
  try {
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

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("q");
    const societyId = searchParams.get("society");
    const rawLimit = parseInt(searchParams.get("limit") || "20");
    const rawOffset = parseInt(searchParams.get("offset") || "0");
    const limit =
      Number.isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);
    const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

    let sql = `
      SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.registration_end, e.ticket_price, e.max_tickets, e.is_paid,
             e.category_id, ec.name AS category_name,
             s.id AS society_id,
             CASE
               WHEN creator.user_type = 'SUPER_ADMIN' THEN
                 CONCAT_WS(' | ', s.name, 'NUST Administration', NULLIF(ch.cohost_society_names, ''))
               ELSE
                 CONCAT_WS(
                   ' | ',
                   s.name,
                   CASE WHEN ch.has_nust_admin THEN 'NUST Administration' ELSE NULL END,
                   NULLIF(ch.cohost_society_names, '')
                 )
             END AS society_name,
             s.logo_url AS society_logo,
             COALESCE(tc.tickets_sold, 0) AS tickets_sold
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      JOIN societies s ON e.society_id = s.id
      LEFT JOIN users creator ON creator.id = e.created_by
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
        FROM tickets t
        WHERE t.event_id = e.id
      ) tc ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          BOOL_OR(eco.cohost_type = 'NUST_ADMIN' AND eco.status = 'ACTIVE') AS has_nust_admin,
          STRING_AGG(DISTINCT sc.name, ' | ') FILTER (
            WHERE eco.cohost_type = 'SOCIETY'
              AND eco.status = 'ACTIVE'
              AND sc.id IS NOT NULL
              AND sc.id != e.society_id
          ) AS cohost_society_names
        FROM event_cohosts eco
        LEFT JOIN societies sc ON sc.id = eco.society_id
        WHERE eco.event_id = e.id
      ) ch ON TRUE
      WHERE e.is_cancelled = FALSE AND e.deleted_at IS NULL
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (category) {
      sql += ` AND LOWER(ec.name) = LOWER($${paramIndex})`;
      params.push(category);
      paramIndex++;
    }

    if (societyId) {
      sql += ` AND e.society_id = $${paramIndex}`;
      params.push(societyId);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY e.event_start ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const events = result.rows.map((row) =>
      resolveMediaFields(
        row,
        {
          banner_url: CONTAINERS.EVENT_MEDIA,
          society_logo: CONTAINERS.SOCIETY_MEDIA,
        },
        24 * 60,
      ),
    );

    return NextResponse.json({ events });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
