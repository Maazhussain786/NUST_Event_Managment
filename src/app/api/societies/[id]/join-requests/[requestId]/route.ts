export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getClient } from "@/lib/db";
import { ApiErrors, writeAuditLog } from "@/lib/api-utils";
import { getSocietyAccess, can, ensureSocietyMember, setChangeContext, RbacError } from "@/lib/rbac";
import { notifyUser } from "@/lib/notify";

/**
 * PATCH /api/societies/[id]/join-requests/[requestId]  (FR-AUTH-02, FR-AUTH-05)
 * Reviewer actions: APPROVE, REJECT, REQUEST_INFO, SCHEDULE_INTERVIEW.
 *
 * APPROVE always grants society membership. For Team Lead / Executive requests
 * that name an event and portfolio, a reviewer who can manage teams may also
 * place the person on that event team (`place_on_team: true`).
 * Officer roles are assigned afterwards through the role screen (needs a reason).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const { id: societyId, requestId } = params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toUpperCase();
    const reviewNotes = String(body.review_notes || "").trim() || null;

    if (!["APPROVE", "REJECT", "REQUEST_INFO", "SCHEDULE_INTERVIEW"].includes(action)) {
      return ApiErrors.validation("action must be APPROVE, REJECT, REQUEST_INFO or SCHEDULE_INTERVIEW");
    }

    await client.query("BEGIN");
    const access = await getSocietyAccess(user, societyId, client);
    if (!access) {
      await client.query("ROLLBACK");
      return ApiErrors.notFound("Society");
    }
    if (!can(access, "APPROVE_ACCOUNTS")) {
      await client.query("ROLLBACK");
      return ApiErrors.forbidden("You do not have permission to review account requests");
    }

    const requestResult = await client.query(
      `SELECT jr.id, jr.user_id, jr.status, jr.requested_role, jr.requested_portfolio_id, jr.requested_event_id,
              u.full_name AS applicant_name, s.name AS society_name
       FROM society_join_requests jr
       JOIN users u ON u.id = jr.user_id
       JOIN societies s ON s.id = jr.society_id
       WHERE jr.id = $1 AND jr.society_id = $2
       FOR UPDATE OF jr`,
      [requestId, societyId],
    );
    const reqRow = requestResult.rows[0];
    if (!reqRow) {
      await client.query("ROLLBACK");
      return ApiErrors.notFound("Request");
    }
    if (["APPROVED", "REJECTED", "WITHDRAWN"].includes(reqRow.status)) {
      await client.query("ROLLBACK");
      return ApiErrors.conflict(`Request already ${reqRow.status.toLowerCase()}`);
    }
    if (reqRow.user_id === user.userId && !access.isSuperAdmin) {
      await client.query("ROLLBACK");
      return ApiErrors.forbidden("You cannot review your own request");
    }

    const link = `/societies/${societyId}`;
    let notice: { title: string; body: string } | null = null;

    if (action === "SCHEDULE_INTERVIEW") {
      const interviewAt = body.interview_scheduled_at;
      if (!interviewAt || Number.isNaN(Date.parse(interviewAt))) {
        await client.query("ROLLBACK");
        return ApiErrors.validation("A valid interview_scheduled_at is required");
      }
      await client.query(
        `UPDATE society_join_requests
         SET status = 'INTERVIEW_SCHEDULED', interview_scheduled_at = $3, interview_mode = $4,
             interview_location = $5, interview_meeting_link = $6, interview_notes = $7,
             review_notes = COALESCE($8, review_notes), reviewed_by = $9, reviewed_at = NOW(),
             member_notified_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND society_id = $2`,
        [
          requestId, societyId, interviewAt,
          String(body.interview_mode || "").trim() || null,
          String(body.interview_location || "").trim() || null,
          String(body.interview_meeting_link || "").trim() || null,
          String(body.interview_notes || "").trim() || null,
          reviewNotes, user.userId,
        ],
      );
      notice = {
        title: "Interview scheduled",
        body: `Your ${reqRow.society_name} interview is on ${new Date(interviewAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}.`,
      };
    } else if (action === "REQUEST_INFO") {
      const message = String(body.info_request_message || reviewNotes || "").trim();
      if (!message) {
        await client.query("ROLLBACK");
        return ApiErrors.validation("Say what information you need");
      }
      await client.query(
        `UPDATE society_join_requests
         SET status = 'INFO_REQUESTED', info_request_message = $3, reviewed_by = $4, reviewed_at = NOW(),
             member_notified_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND society_id = $2`,
        [requestId, societyId, message, user.userId],
      );
      notice = {
        title: "More information needed",
        body: `${reqRow.society_name} needs more information about your request: ${message}`,
      };
    } else if (action === "REJECT") {
      await client.query(
        `UPDATE society_join_requests
         SET status = 'REJECTED', review_notes = $3, reviewed_by = $4, reviewed_at = NOW(),
             member_notified_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND society_id = $2`,
        [requestId, societyId, reviewNotes, user.userId],
      );
      notice = {
        title: "Request not approved",
        body: `Your request to join ${reqRow.society_name} was not approved.${reviewNotes ? ` Note: ${reviewNotes}` : ""}`,
      };
    } else {
      // APPROVE
      await setChangeContext(client, {
        actorId: user.userId,
        reason: reviewNotes || "Account request approved",
        source: "APPLICATION",
      });
      await ensureSocietyMember(client, societyId, reqRow.user_id, user.userId);

      let placedOnTeam = false;
      const wantsTeam = (reqRow.requested_role === "TEAM_LEAD" || reqRow.requested_role === "EXECUTIVE")
        && reqRow.requested_event_id && reqRow.requested_portfolio_id;
      if (wantsTeam && body.place_on_team === true) {
        if (!can(access, "MANAGE_TEAMS")) {
          await client.query("ROLLBACK");
          return ApiErrors.forbidden("Placing someone on an event team needs the Manage teams permission");
        }
        const team = await client.query(
          `INSERT INTO event_teams (society_id, event_id, portfolio_id, created_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id, portfolio_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()
           RETURNING id`,
          [societyId, reqRow.requested_event_id, reqRow.requested_portfolio_id, user.userId],
        );
        await client.query(
          `INSERT INTO event_team_members (team_id, event_id, society_id, user_id, team_role, source, assigned_by)
           VALUES ($1, $2, $3, $4, $5, 'APPLICATION', $6)
           ON CONFLICT DO NOTHING`,
          [team.rows[0].id, reqRow.requested_event_id, societyId, reqRow.user_id, reqRow.requested_role, user.userId],
        );
        placedOnTeam = true;
      }

      await client.query(
        `UPDATE society_join_requests
         SET status = 'APPROVED', review_notes = COALESCE($3, review_notes), reviewed_by = $4, reviewed_at = NOW(),
             member_notified_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND society_id = $2`,
        [requestId, societyId, reviewNotes, user.userId],
      );
      notice = {
        title: "Request approved",
        body: placedOnTeam
          ? `Welcome to ${reqRow.society_name}! You have been added to your requested team.`
          : `Welcome to ${reqRow.society_name}! Your account request was approved.`,
      };
    }

    await writeAuditLog(
      {
        action: `ACCOUNT_REQUEST_${action}`,
        performedBy: user.userId,
        societyId,
        targetType: "society_join_request",
        targetId: requestId,
        metadata: { applicant: reqRow.user_id, requested_role: reqRow.requested_role, notes: reviewNotes },
      },
      client,
    );
    await client.query("COMMIT");

    if (notice) {
      await notifyUser(reqRow.user_id, { ...notice, link: action === "APPROVE" ? `/society/${societyId}/dashboard` : link, email: true });
    }
    const statusByAction: Record<string, string> = {
      APPROVE: "APPROVED", REJECT: "REJECTED", REQUEST_INFO: "INFO_REQUESTED", SCHEDULE_INTERVIEW: "INTERVIEW_SCHEDULED",
    };
    return NextResponse.json({ success: true, status: statusByAction[action] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof RbacError) return ApiErrors.conflict(error.message);
    return ApiErrors.serverError("Review join request error:", error);
  } finally {
    client.release();
  }
}
