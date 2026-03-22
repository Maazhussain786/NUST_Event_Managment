export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getClient } from "@/lib/db";
import { ensureSocietyJoinRequestsTable } from "@/lib/api-utils";

async function isPresidentOrSuperAdmin(
  userId: string,
  societyId: string,
  client: Awaited<ReturnType<typeof getClient>>,
  userType: string,
): Promise<boolean> {
  if (userType === "SUPER_ADMIN") return true;

  const roleResult = await client.query(
    `SELECT r.name AS role_name
     FROM society_memberships sm
     JOIN roles r ON sm.role_id = r.id
     WHERE sm.user_id = $1
       AND sm.society_id = $2
       AND sm.is_active = TRUE
       AND sm.suspended_at IS NULL
     ORDER BY r.hierarchy_level DESC
     LIMIT 1`,
    [userId, societyId],
  );

  return roleResult.rows[0]?.role_name === "President";
}

// PATCH /api/societies/[id]/join-requests/[requestId]
// President actions: APPROVE, REJECT, SCHEDULE_INTERVIEW
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; requestId: string } },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: societyId, requestId } = params;
    const body = await req.json();
    const action = (body.action || "").toUpperCase();

    if (!["APPROVE", "REJECT", "SCHEDULE_INTERVIEW"].includes(action)) {
      return NextResponse.json(
        { error: "action must be APPROVE, REJECT, or SCHEDULE_INTERVIEW" },
        { status: 400 },
      );
    }

    await client.query("BEGIN");
    await ensureSocietyJoinRequestsTable(client);

    const authorized = await isPresidentOrSuperAdmin(
      user.userId,
      societyId,
      client,
      user.userType,
    );

    if (!authorized) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Only President can review join requests" },
        { status: 403 },
      );
    }

    const requestResult = await client.query(
      `SELECT jr.id, jr.user_id, jr.status,
              u.full_name AS applicant_name,
              s.name AS society_name
       FROM society_join_requests jr
       JOIN users u ON u.id = jr.user_id
       JOIN societies s ON s.id = jr.society_id
       WHERE jr.id = $1 AND jr.society_id = $2
       FOR UPDATE`,
      [requestId, societyId],
    );

    if (requestResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Join request not found" },
        { status: 404 },
      );
    }

    const reqRow = requestResult.rows[0];

    if (["APPROVED", "REJECTED", "WITHDRAWN"].includes(reqRow.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `Request already ${reqRow.status.toLowerCase()}` },
        { status: 409 },
      );
    }

    const reviewNotes = (body.review_notes || "").trim();

    if (action === "SCHEDULE_INTERVIEW") {
      const interviewAt = body.interview_scheduled_at;
      if (!interviewAt) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "interview_scheduled_at is required" },
          { status: 400 },
        );
      }

      await client.query(
        `UPDATE society_join_requests
         SET status = 'INTERVIEW_SCHEDULED',
             interview_scheduled_at = $3,
             interview_mode = $4,
             interview_location = $5,
             interview_meeting_link = $6,
             interview_notes = $7,
             review_notes = $8,
             reviewed_by = $9,
             reviewed_at = NOW(),
             member_notified_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND society_id = $2`,
        [
          requestId,
          societyId,
          interviewAt,
          (body.interview_mode || "").trim() || null,
          (body.interview_location || "").trim() || null,
          (body.interview_meeting_link || "").trim() || null,
          (body.interview_notes || "").trim() || null,
          reviewNotes || null,
          user.userId,
        ],
      );

      await client.query(
        `INSERT INTO notifications (user_id, title, body, link)
         VALUES ($1, $2, $3, $4)`,
        [
          reqRow.user_id,
          "Interview Scheduled",
          `Your ${reqRow.society_name} join interview is scheduled on ${new Date(interviewAt).toLocaleString()}. Check details in your society page.`,
          `/societies/${societyId}`,
        ],
      );

      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        status: "INTERVIEW_SCHEDULED",
      });
    }

    if (action === "REJECT") {
      await client.query(
        `UPDATE society_join_requests
         SET status = 'REJECTED',
             review_notes = $3,
             reviewed_by = $4,
             reviewed_at = NOW(),
             member_notified_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND society_id = $2`,
        [requestId, societyId, reviewNotes || null, user.userId],
      );

      await client.query(
        `INSERT INTO notifications (user_id, title, body, link)
         VALUES ($1, $2, $3, $4)`,
        [
          reqRow.user_id,
          "Join Request Update",
          reviewNotes
            ? `Your join request to ${reqRow.society_name} was not approved. Note: ${reviewNotes}`
            : `Your join request to ${reqRow.society_name} was not approved.`,
          `/societies/${societyId}`,
        ],
      );

      await client.query("COMMIT");
      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    // APPROVE
    const memberCheck = await client.query(
      `SELECT 1 FROM society_memberships
       WHERE society_id = $1
         AND user_id = $2
         AND is_active = TRUE
         AND suspended_at IS NULL
       LIMIT 1`,
      [societyId, reqRow.user_id],
    );

    if (memberCheck.rows.length > 0) {
      await client.query(
        `UPDATE society_join_requests
         SET status = 'APPROVED',
             review_notes = COALESCE($3, review_notes),
             reviewed_by = $4,
             reviewed_at = NOW(),
             member_notified_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND society_id = $2`,
        [requestId, societyId, reviewNotes || null, user.userId],
      );

      await client.query("COMMIT");
      return NextResponse.json({ success: true, status: "APPROVED" });
    }

    const roleResult = await client.query(
      `SELECT id FROM roles WHERE society_id = $1 AND name = 'Member' LIMIT 1`,
      [societyId],
    );

    if (roleResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Member role not found for this society" },
        { status: 500 },
      );
    }

    await client.query(
      `INSERT INTO society_memberships (society_id, user_id, role_id, is_active, assigned_at)
       VALUES ($1, $2, $3, TRUE, NOW())`,
      [societyId, reqRow.user_id, roleResult.rows[0].id],
    );

    await client.query(
      `UPDATE society_join_requests
       SET status = 'APPROVED',
           review_notes = $3,
           reviewed_by = $4,
           reviewed_at = NOW(),
           member_notified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND society_id = $2`,
      [requestId, societyId, reviewNotes || null, user.userId],
    );

    await client.query(
      `INSERT INTO notifications (user_id, title, body, link)
       VALUES ($1, $2, $3, $4)`,
      [
        reqRow.user_id,
        "Welcome to the Society",
        `Your join request has been approved. You are now a member of ${reqRow.society_name}.`,
        `/society/${societyId}/dashboard`,
      ],
    );

    await client.query("COMMIT");

    return NextResponse.json({ success: true, status: "APPROVED" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Review join request error:", error);
    return NextResponse.json(
      { error: "Failed to process join request" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
