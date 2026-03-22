import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { CONTAINERS, extractBlobName, generateReadUrl } from "@/lib/blob";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    const result = await query(
      `SELECT s.id, s.name, s.description, s.logo_url, s.status,
              s.is_nust_wide, s.school_id, s.created_at,
              ns.full_name AS school_name, ns.abbreviation AS school_abbr,
              COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count,
              COALESCE(AVG(r.score), 0)::numeric(3,2) AS avg_rating,
              COUNT(DISTINCT r.id) AS rating_count
       FROM societies s
       LEFT JOIN nust_schools ns ON s.school_id = ns.id
       LEFT JOIN society_memberships sm ON s.id = sm.society_id AND sm.is_active = TRUE
       LEFT JOIN ratings r ON r.target_type = 'SOCIETY' AND r.target_id = s.id
       WHERE s.id = $1
       GROUP BY s.id, ns.full_name, ns.abbreviation`,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Society not found" }, { status: 404 });
    }

    // Fetch upcoming events for this society
    const eventsResult = await query(
      `SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.ticket_price, e.max_tickets,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
       FROM events e
       LEFT JOIN tickets t ON e.id = t.event_id
       WHERE e.society_id = $1 AND e.is_cancelled = FALSE AND e.event_end >= NOW()
       GROUP BY e.id
       ORDER BY e.event_start ASC
       LIMIT 10`,
      [id],
    );

    // Fetch wings
    const wingsResult = await query(
      `SELECT w.id, w.name, w.description FROM wings w WHERE w.society_id = $1 ORDER BY w.name`,
      [id],
    );

    // Fetch portfolios grouped by wing for public join/apply flows.
    const portfoliosResult = await query(
      `SELECT p.id, p.name, p.wing_id
       FROM portfolios p
       JOIN wings w ON w.id = p.wing_id
       WHERE w.society_id = $1
         AND p.deleted_at IS NULL
       ORDER BY p.name`,
      [id],
    );

    const society = (() => {
      const row = result.rows[0];
      const logoBlob = row.logo_url
        ? extractBlobName(row.logo_url, CONTAINERS.SOCIETY_MEDIA)
        : null;
      return {
        ...row,
        logo_url: logoBlob
          ? generateReadUrl(CONTAINERS.SOCIETY_MEDIA, logoBlob, 24 * 60)
          : row.logo_url,
      };
    })();

    const events = eventsResult.rows.map((row) => {
      const bannerBlob = row.banner_url
        ? extractBlobName(row.banner_url, CONTAINERS.EVENT_MEDIA)
        : null;
      return {
        ...row,
        banner_url: bannerBlob
          ? generateReadUrl(CONTAINERS.EVENT_MEDIA, bannerBlob, 24 * 60)
          : row.banner_url,
      };
    });

    const portfoliosByWing = new Map<
      string,
      Array<{ id: string; name: string }>
    >();
    for (const row of portfoliosResult.rows as Array<{
      id: string;
      name: string;
      wing_id: string;
    }>) {
      if (!portfoliosByWing.has(row.wing_id))
        portfoliosByWing.set(row.wing_id, []);
      portfoliosByWing.get(row.wing_id)!.push({ id: row.id, name: row.name });
    }

    const wings = (
      wingsResult.rows as Array<{
        id: string;
        name: string;
        description: string | null;
      }>
    ).map((wing) => ({
      ...wing,
      portfolios: portfoliosByWing.get(wing.id) || [],
    }));

    return NextResponse.json({
      society,
      events,
      wings,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch society";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
