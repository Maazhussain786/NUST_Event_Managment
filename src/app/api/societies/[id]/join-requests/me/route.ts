export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ApiErrors } from "@/lib/api-utils";
import { notifyUsers, usersWithSocietyPrivilege } from "@/lib/notify";

const REQUEST_COLUMNS = `id, status, application_data, review_notes, requested_role, requested_portfolio_id,
  requested_event_id, info_request_message, interview_scheduled_at, interview_mode,
  interview_location, interview_meeting_link, interview_notes, reviewed_at, created_at, updated_at`;

// GET /api/societies/[id]/join-requests/me — my membership and latest request
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const memberResult = await query(
      `SELECT sm.id, r.name AS role_name, r.tier
       FROM society_memberships sm JOIN roles r ON sm.role_id = r.id
       WHERE sm.society_id = $1 AND sm.user_id = $2 AND sm.is_active AND sm.suspended_at IS NULL
       ORDER BY r.hierarchy_level DESC LIMIT 1`,
      [params.id, user.userId],
    );
    const requestResult = await query(
      `SELECT ${REQUEST_COLUMNS} FROM society_join_requests
       WHERE society_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [params.id, user.userId],
    );
    const member = memberResult.rows[0];

    return NextResponse.json({
      is_member: Boolean(member),
      role_name: member?.role_name ?? null,
      tier: member?.tier ?? null,
      request: requestResult.rows[0] || null,
    });
  } catch (error) {
    return ApiErrors.serverError("Get my join request status error:", error);
  }
}

// PUT /api/societies/[id]/join-requests/me — answer an "information requested" review
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const body = await req.json().catch(() => ({}));
    const response = String(body.response || "").trim();
    if (!response) return ApiErrors.validation("Please provide the requested information");

    const updated = await query(
      `UPDATE society_join_requests
       SET status = 'PENDING',
           application_data = application_data || jsonb_build_object('info_response', $3::text,
                                                                      'info_response_at', NOW()::text),
           updated_at = NOW()
       WHERE society_id = $1 AND user_id = $2 AND status = 'INFO_REQUESTED'
       RETURNING ${REQUEST_COLUMNS}`,
      [params.id, user.userId, response.slice(0, 4000)],
    );
    if (updated.rows.length === 0) return ApiErrors.conflict("There is no request waiting for more information");

    const reviewers = await usersWithSocietyPrivilege(params.id, "APPROVE_ACCOUNTS");
    await notifyUsers(reviewers, {
      title: "Account request updated",
      body: `${user.fullName} answered your request for more information.`,
      link: `/society/${params.id}/members`,
    });
    return NextResponse.json({ success: true, request: updated.rows[0] });
  } catch (error) {
    return ApiErrors.serverError("Update my join request error:", error);
  }
}

// DELETE /api/societies/[id]/join-requests/me — withdraw my open request
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const updated = await query(
      `UPDATE society_join_requests SET status = 'WITHDRAWN', updated_at = NOW()
       WHERE society_id = $1 AND user_id = $2 AND status IN ('PENDING', 'INFO_REQUESTED', 'INTERVIEW_SCHEDULED')
       RETURNING id`,
      [params.id, user.userId],
    );
    if (updated.rows.length === 0) return ApiErrors.conflict("You have no open request to withdraw");
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError("Withdraw join request error:", error);
  }
}
