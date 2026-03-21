export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { CONTAINERS, extractBlobName, generateReadUrl } from "@/lib/blob";

export async function GET(req: Request) {
  try {
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
             e.event_start, e.event_end, e.ticket_price, e.max_tickets, e.is_paid,
             e.category_id, ec.name AS category_name,
             s.id AS society_id, s.name AS society_name, s.logo_url AS society_logo,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      JOIN societies s ON e.society_id = s.id
      LEFT JOIN tickets t ON e.id = t.event_id
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

    sql += ` GROUP BY e.id, ec.name, s.id ORDER BY e.event_start ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const events = result.rows.map((row) => {
      const bannerBlob = row.banner_url
        ? extractBlobName(row.banner_url, CONTAINERS.EVENT_MEDIA)
        : null;
      const logoBlob = row.society_logo
        ? extractBlobName(row.society_logo, CONTAINERS.SOCIETY_MEDIA)
        : null;

      return {
        ...row,
        banner_url: bannerBlob
          ? generateReadUrl(CONTAINERS.EVENT_MEDIA, bannerBlob, 24 * 60)
          : row.banner_url,
        society_logo: logoBlob
          ? generateReadUrl(CONTAINERS.SOCIETY_MEDIA, logoBlob, 24 * 60)
          : row.society_logo,
      };
    });

    return NextResponse.json({ events });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
