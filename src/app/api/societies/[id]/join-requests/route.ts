export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getClient } from "@/lib/db";
import { ApiErrors } from "@/lib/api-utils";
import { CONTAINERS, resolveMediaFields } from "@/lib/blob";
import { getSocietyAccess, can } from "@/lib/rbac";
import { notifyUsers, usersWithSocietyPrivilege } from "@/lib/notify";

/**
 * Account / access requests (FR-AUTH-01, 4.1): a signed-in SEECS user asks to
 * join a society, optionally as a Team Lead / Executive for a portfolio of an
 * event, or as an Officer. Reviewed by holders of APPROVE_ACCOUNTS.
 */
const REQUESTABLE_ROLES = ["MEMBER", "EXECUTIVE", "TEAM_LEAD", "OFFICER"] as const;
const OPEN_STATUSES = ["PENDING", "INFO_REQUESTED", "INTERVIEW_SCHEDULED"];

// POST /api/societies/[id]/join-requests — submit a request
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const societyId = params.id;
    const body = await req.json().catch(() => ({}));
    const requestedRole = String(body.requested_role || "MEMBER").toUpperCase();
    const portfolioId: string | null = body.preferred_portfolio_id || body.requested_portfolio_id || null;
    const eventId: string | null = body.requested_event_id || null;

    const applicationData = {
      phone: String(body.phone || "").trim(),
      cms_id: String(body.cms_id || "").trim(),
      department: String(body.department || "").trim(),
      year_of_study: String(body.year_of_study || "").trim(),
      preferred_wing_id: body.preferred_wing_id || null,
      preferred_portfolio_id: portfolioId,
      skills: Array.isArray(body.skills) ? body.skills.slice(0, 20).map(String) : [],
      availability: String(body.availability || "").trim(),
      motivation: String(body.motivation || "").trim(),
      prior_experience: String(body.prior_experience || "").trim(),
      expected_contribution: String(body.expected_contribution || "").trim(),
    };

    if (!(REQUESTABLE_ROLES as readonly string[]).includes(requestedRole)) {
      return ApiErrors.validation("Invalid requested role");
    }
    if (!applicationData.phone || !applicationData.department || !applicationData.year_of_study || !applicationData.motivation) {
      return ApiErrors.validation("phone, department, year_of_study, and motivation are required");
    }
    if ((requestedRole === "TEAM_LEAD" || requestedRole === "EXECUTIVE") && !portfolioId) {
      return ApiErrors.validation("Choose the portfolio you are requesting");
    }

    await client.query("BEGIN");

    const societyResult = await client.query(
      `SELECT id, name, status FROM societies WHERE id = $1 AND deleted_at IS NULL`,
      [societyId],
    );
    const society = societyResult.rows[0];
    if (!society) {
      await client.query("ROLLBACK");
      return ApiErrors.notFound("Society");
    }
    if (society.status !== "APPROVED") {
      await client.query("ROLLBACK");
      return ApiErrors.conflict("Society is not currently accepting requests");
    }

    if (portfolioId) {
      const portfolio = await client.query(
        `SELECT wing_id FROM portfolios WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL`,
        [portfolioId, societyId],
      );
      if (portfolio.rows.length === 0) {
        await client.query("ROLLBACK");
        return ApiErrors.validation("Selected portfolio is not part of this society");
      }
      applicationData.preferred_wing_id = portfolio.rows[0].wing_id;
    } else if (applicationData.preferred_wing_id) {
      const wing = await client.query(
        `SELECT 1 FROM wings WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL`,
        [applicationData.preferred_wing_id, societyId],
      );
      if (wing.rows.length === 0) {
        await client.query("ROLLBACK");
        return ApiErrors.validation("Selected wing is not part of this society");
      }
    }

    if (eventId) {
      const event = await client.query(
        `SELECT 1 FROM events WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL AND archived_at IS NULL`,
        [eventId, societyId],
      );
      if (event.rows.length === 0) {
        await client.query("ROLLBACK");
        return ApiErrors.validation("Selected event is not open in this society");
      }
    }

    const memberCheck = await client.query(
      `SELECT suspended_at FROM society_memberships
       WHERE society_id = $1 AND user_id = $2 AND (is_active OR suspended_at IS NOT NULL)
       ORDER BY is_active DESC LIMIT 1`,
      [societyId, user.userId],
    );
    if (memberCheck.rows[0]?.suspended_at) {
      await client.query("ROLLBACK");
      return ApiErrors.forbidden("You are suspended from this society");
    }
    if (memberCheck.rows.length > 0 && requestedRole === "MEMBER") {
      await client.query("ROLLBACK");
      return ApiErrors.conflict("You are already a member of this society");
    }

    const openRequest = await client.query(
      `SELECT id, status FROM society_join_requests
       WHERE society_id = $1 AND user_id = $2 AND status = ANY($3)
       ORDER BY created_at DESC LIMIT 1`,
      [societyId, user.userId, OPEN_STATUSES],
    );
    if (openRequest.rows.length > 0) {
      await client.query("ROLLBACK");
      return ApiErrors.conflict("You already have an open request for this society", {
        status: openRequest.rows[0].status,
      });
    }

    const insertResult = await client.query(
      `INSERT INTO society_join_requests
         (society_id, user_id, status, application_data, requested_role, requested_portfolio_id, requested_event_id)
       VALUES ($1, $2, 'PENDING', $3::jsonb, $4, $5, $6)
       RETURNING id, status, created_at`,
      [societyId, user.userId, JSON.stringify(applicationData), requestedRole, portfolioId, eventId],
    );
    await client.query("COMMIT");

    const reviewers = await usersWithSocietyPrivilege(societyId, "APPROVE_ACCOUNTS");
    const roleLabel = requestedRole.replace("_", " ").toLowerCase();
    await notifyUsers(reviewers, {
      title: "New account request",
      body: `${user.fullName} requested to join ${society.name} as ${roleLabel}.`,
      link: `/society/${societyId}/members`,
      email: true,
    });

    return NextResponse.json({ success: true, request: insertResult.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return ApiErrors.serverError("Submit join request error:", error);
  } finally {
    client.release();
  }
}

// GET /api/societies/[id]/join-requests?status=OPEN|PENDING|... — reviewers list requests
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const societyId = params.id;
    const statusFilter = (req.nextUrl.searchParams.get("status") || "OPEN").toUpperCase();

    const access = await getSocietyAccess(user, societyId, client);
    if (!access) return ApiErrors.notFound("Society");
    if (!can(access, "APPROVE_ACCOUNTS")) {
      return ApiErrors.forbidden("You do not have permission to review account requests");
    }

    const paramsList: unknown[] = [societyId];
    let whereStatus = "";
    if (statusFilter === "OPEN") {
      paramsList.push(OPEN_STATUSES);
      whereStatus = "AND jr.status = ANY($2)";
    } else if (["PENDING", "INFO_REQUESTED", "INTERVIEW_SCHEDULED", "APPROVED", "REJECTED", "WITHDRAWN"].includes(statusFilter)) {
      paramsList.push(statusFilter);
      whereStatus = "AND jr.status = $2";
    }

    const result = await client.query(
      `SELECT jr.id, jr.status, jr.application_data, jr.review_notes,
              jr.reviewed_by, jr.reviewed_at,
              jr.interview_scheduled_at, jr.interview_mode,
              jr.interview_location, jr.interview_meeting_link, jr.interview_notes,
              jr.requested_role, jr.requested_portfolio_id, jr.requested_event_id, jr.info_request_message,
              p.name AS requested_portfolio_name, e.title AS requested_event_title,
              jr.created_at, jr.updated_at,
              u.id AS user_id, u.full_name, u.email, u.avatar_url, u.cms_id,
              ru.full_name AS reviewed_by_name
       FROM society_join_requests jr
       JOIN users u ON u.id = jr.user_id
       LEFT JOIN users ru ON ru.id = jr.reviewed_by
       LEFT JOIN portfolios p ON p.id = jr.requested_portfolio_id
       LEFT JOIN events e ON e.id = jr.requested_event_id
       WHERE jr.society_id = $1 ${whereStatus}
       ORDER BY jr.created_at DESC
       LIMIT 500`,
      paramsList,
    );

    const requests = result.rows.map((row) => resolveMediaFields(row, { avatar_url: CONTAINERS.PROFILE_PICTURES }));
    return NextResponse.json({ requests });
  } catch (error) {
    return ApiErrors.serverError("Get join requests error:", error);
  } finally {
    client.release();
  }
}
