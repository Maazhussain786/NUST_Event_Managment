export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getClient } from "@/lib/db";
import { ensureSocietyJoinRequestsTable } from "@/lib/api-utils";

// GET /api/societies/[id]/join-requests/me
// Returns current user membership/join-request state for this society.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: societyId } = params;

    await ensureSocietyJoinRequestsTable(client);

    const memberResult = await client.query(
      `SELECT sm.id, r.name AS role_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.society_id = $1
         AND sm.user_id = $2
         AND sm.is_active = TRUE
         AND sm.suspended_at IS NULL
       ORDER BY r.hierarchy_level DESC
       LIMIT 1`,
      [societyId, user.userId],
    );

    if (memberResult.rows.length > 0) {
      return NextResponse.json({
        is_member: true,
        role_name: memberResult.rows[0].role_name,
        request: null,
      });
    }

    const requestResult = await client.query(
      `SELECT id, status, application_data, review_notes,
              interview_scheduled_at, interview_mode,
              interview_location, interview_meeting_link, interview_notes,
              reviewed_at, created_at, updated_at
       FROM society_join_requests
       WHERE society_id = $1
         AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [societyId, user.userId],
    );

    return NextResponse.json({
      is_member: false,
      request: requestResult.rows[0] || null,
    });
  } catch (error) {
    console.error("Get my join request status error:", error);
    return NextResponse.json(
      { error: "Failed to fetch join request status" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
