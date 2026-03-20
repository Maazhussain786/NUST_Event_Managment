export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/admin/societies/[id]/members?q=search
 * Returns active members for member-picker during forced presidency transfer.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.userType !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Forbidden — SuperAdmin only" },
        { status: 403 },
      );
    }

    const societyId = params.id;
    const search = (req.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get("limit") || "25", 10),
      50,
    );
    const pattern = `%${search}%`;

    const result = await query(
      `SELECT sm.user_id AS id,
              u.full_name,
              u.email,
              r.name AS role_name,
              (r.name = 'President') AS is_current_president
       FROM society_memberships sm
       JOIN users u ON u.id = sm.user_id
       JOIN roles r ON r.id = sm.role_id
       WHERE sm.society_id = $1
         AND sm.is_active = TRUE
         AND u.status = 'ACTIVE'
         AND ($2 = '' OR u.full_name ILIKE $3 OR u.email ILIKE $3)
       ORDER BY (r.name = 'President') DESC, u.full_name ASC
       LIMIT $4`,
      [societyId, search, pattern, limit],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Admin society members search error:", error);
    return NextResponse.json(
      { error: "Failed to fetch society members" },
      { status: 500 },
    );
  }
}
