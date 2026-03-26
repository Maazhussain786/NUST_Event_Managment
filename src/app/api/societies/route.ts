export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { CONTAINERS, resolveMediaFields } from "@/lib/blob";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const schoolId = searchParams.get("school");
    const search = searchParams.get("q");
    const rawLimit = parseInt(searchParams.get("limit") || "20");
    const rawOffset = parseInt(searchParams.get("offset") || "0");
    const limit =
      Number.isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);
    const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

    // Build WHERE clause for both the count and data queries
    let whereClause = `WHERE s.status = 'APPROVED'`;
    const filterParams: (string | number)[] = [];
    let paramIndex = 1;

    if (schoolId && schoolId !== "all") {
      whereClause += ` AND s.school_id = $${paramIndex}`;
      filterParams.push(schoolId);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`;
      filterParams.push(`%${search}%`);
      paramIndex++;
    }

    // Get actual total count for pagination
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM societies s ${whereClause}`,
      filterParams,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated data
    const sql = `
      SELECT s.id, s.name, s.description, s.logo_url, s.status,
             s.is_nust_wide, s.school_id,
             ns.full_name AS school_name, ns.abbreviation AS school_abbr,
             COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count,
             COALESCE(AVG(r.score), 0)::numeric(3,2) AS avg_rating
      FROM societies s
      LEFT JOIN nust_schools ns ON s.school_id = ns.id
      LEFT JOIN society_memberships sm ON s.id = sm.society_id
      LEFT JOIN ratings r ON r.target_type = 'SOCIETY' AND r.target_id = s.id
      ${whereClause}
      GROUP BY s.id, ns.full_name, ns.abbreviation
      ORDER BY member_count DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataParams = [...filterParams, limit, offset];

    const result = await query(sql, dataParams);

    const societies = result.rows.map((row) =>
      resolveMediaFields(
        row,
        {
          logo_url: CONTAINERS.SOCIETY_MEDIA,
        },
        24 * 60,
      ),
    );

    return NextResponse.json({ societies, total });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch societies";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
