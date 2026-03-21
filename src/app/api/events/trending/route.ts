export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { CONTAINERS, extractBlobName, generateReadUrl } from "@/lib/blob";

export async function GET() {
  try {
    const result = await query(
      `SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.ticket_price, e.max_tickets, e.is_paid,
              ec.name AS category_name,
              s.id AS society_id, s.name AS society_name, s.logo_url AS society_logo,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
       FROM events e
       LEFT JOIN event_categories ec ON e.category_id = ec.id
       JOIN societies s ON e.society_id = s.id
       LEFT JOIN tickets t ON e.id = t.event_id
       WHERE e.is_cancelled = FALSE AND e.deleted_at IS NULL AND e.event_end >= NOW()
       GROUP BY e.id, ec.name, s.id
       ORDER BY tickets_sold DESC, e.event_start ASC
       LIMIT 10`,
    );

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
      error instanceof Error
        ? error.message
        : "Failed to fetch trending events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
