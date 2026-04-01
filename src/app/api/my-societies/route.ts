export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, resolveMediaFields } from "@/lib/blob";

// GET /api/my-societies — societies where current user has an active role + pending registrations
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1) Societies where user has an active membership (approved societies)
    const memberResult = await query(
      `SELECT s.id, s.name, s.description, s.logo_url, s.status, s.school_id,
              r.name AS role_name, r.hierarchy_level,
              sm.wing_id, w.name AS wing_name,
              sm.portfolio_id, p.name AS portfolio_name,
              COUNT(DISTINCT sm2.user_id) FILTER (WHERE sm2.is_active = TRUE) AS member_count
       FROM society_memberships sm
       JOIN societies s ON sm.society_id = s.id
       JOIN roles r ON sm.role_id = r.id
       LEFT JOIN wings w ON sm.wing_id = w.id
       LEFT JOIN portfolios p ON sm.portfolio_id = p.id
       LEFT JOIN society_memberships sm2 ON sm2.society_id = s.id
       WHERE sm.user_id = $1 AND sm.is_active = TRUE AND s.status = 'APPROVED'
       GROUP BY s.id, r.name, r.hierarchy_level, sm.wing_id, w.name, sm.portfolio_id, p.name
       ORDER BY r.hierarchy_level DESC`,
      [user.userId],
    );

    // 2) Societies created by user that are still PENDING or REJECTED (not yet in memberships)
    const pendingResult = await query(
      `SELECT s.id, s.name, s.description, s.logo_url, s.status, s.school_id,
              'Creator' AS role_name, 0 AS hierarchy_level,
              NULL AS wing_id, NULL AS wing_name,
              NULL AS portfolio_id, NULL AS portfolio_name,
              0 AS member_count,
              s.president_name, s.contact_number, s.rejection_reason
       FROM societies s
       WHERE s.created_by = $1 AND s.status IN ('PENDING', 'REJECTED')
       ORDER BY s.created_at DESC`,
      [user.userId],
    );

    // Combine and de-duplicate by semantic identity so duplicate society rows
    // (same name/school, different IDs) do not render as repeated cards.
    const combined = [...pendingResult.rows, ...memberResult.rows].map((row) =>
      resolveMediaFields(
        row,
        {
          logo_url: CONTAINERS.SOCIETY_MEDIA,
        },
        24 * 60,
      ),
    );

    const deduped = Array.from(
      combined
        .reduce((acc, row) => {
          const normalizedName = String(row.name ?? "").trim().toLowerCase();
          const schoolKey = String(row.school_id ?? "nust-wide");
          const key = `${normalizedName}|${schoolKey}`;
          const existing = acc.get(key);
          if (!existing) {
            acc.set(key, row);
            return acc;
          }

          const existingLevel = Number(existing.hierarchy_level ?? -1);
          const currentLevel = Number(row.hierarchy_level ?? -1);
          const existingMembers = Number(existing.member_count ?? 0);
          const currentMembers = Number(row.member_count ?? 0);
          const shouldReplace =
            (existing.status !== "APPROVED" && row.status === "APPROVED") ||
            currentLevel > existingLevel ||
            (currentLevel === existingLevel && currentMembers > existingMembers);

          if (shouldReplace) {
            acc.set(key, row);
          }

          return acc;
        }, new Map<string, (typeof combined)[number]>())
        .values(),
    );

    return NextResponse.json(deduped);
  } catch (error) {
    console.error("My societies error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
