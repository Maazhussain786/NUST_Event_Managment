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

// POST /api/societies/[id]/join-requests
// Student submits a join request form.
export async function POST(
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
    const body = await req.json();

    const applicationData = {
      phone: (body.phone || "").trim(),
      department: (body.department || "").trim(),
      year_of_study: (body.year_of_study || "").trim(),
      preferred_wing_id: body.preferred_wing_id || null,
      preferred_portfolio_id: body.preferred_portfolio_id || null,
      skills: Array.isArray(body.skills) ? body.skills : [],
      availability: (body.availability || "").trim(),
      motivation: (body.motivation || "").trim(),
      prior_experience: (body.prior_experience || "").trim(),
      expected_contribution: (body.expected_contribution || "").trim(),
    };

    if (
      !applicationData.phone ||
      !applicationData.department ||
      !applicationData.year_of_study ||
      !applicationData.motivation
    ) {
      return NextResponse.json(
        {
          error:
            "phone, department, year_of_study, and motivation are required",
        },
        { status: 400 },
      );
    }

    await client.query("BEGIN");
    await ensureSocietyJoinRequestsTable(client);

    const societyResult = await client.query(
      `SELECT id, name, status
       FROM societies
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [societyId],
    );

    if (societyResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Society not found" }, { status: 404 });
    }

    const society = societyResult.rows[0];
    if (society.status !== "APPROVED") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Society is not currently accepting join requests" },
        { status: 409 },
      );
    }

    const societyWings = await client.query(
      `SELECT w.id,
              EXISTS (
                SELECT 1
                FROM portfolios p
                WHERE p.wing_id = w.id
                  AND p.deleted_at IS NULL
              ) AS has_portfolios
       FROM wings w
       WHERE w.society_id = $1
         AND w.deleted_at IS NULL`,
      [societyId],
    );

    const wingRows = societyWings.rows as Array<{
      id: string;
      has_portfolios: boolean;
    }>;
    const hasConfiguredWings = wingRows.length > 0;

    if (!hasConfiguredWings) {
      applicationData.preferred_wing_id = null;
      applicationData.preferred_portfolio_id = null;
    } else if (!applicationData.preferred_wing_id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Please select a preferred wing" },
        { status: 400 },
      );
    }

    let selectedWingHasPortfolios = false;
    if (applicationData.preferred_wing_id) {
      const selectedWing = wingRows.find(
        (w) => w.id === applicationData.preferred_wing_id,
      );
      if (!selectedWing) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Selected wing is invalid for this society" },
          { status: 400 },
        );
      }
      selectedWingHasPortfolios = selectedWing.has_portfolios;
    }

    if (!selectedWingHasPortfolios) {
      applicationData.preferred_portfolio_id = null;
    } else if (!applicationData.preferred_portfolio_id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Please select a preferred portfolio" },
        { status: 400 },
      );
    } else {
      const portfolioResult = await client.query(
        `SELECT id FROM portfolios
         WHERE id = $1
           AND wing_id = $2
           AND deleted_at IS NULL
         LIMIT 1`,
        [
          applicationData.preferred_portfolio_id,
          applicationData.preferred_wing_id,
        ],
      );
      if (portfolioResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Selected portfolio is invalid for the selected wing" },
          { status: 400 },
        );
      }
    }

    const memberCheck = await client.query(
      `SELECT 1 FROM society_memberships
       WHERE society_id = $1
         AND user_id = $2
         AND is_active = TRUE
         AND suspended_at IS NULL
       LIMIT 1`,
      [societyId, user.userId],
    );

    if (memberCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "You are already a member of this society" },
        { status: 409 },
      );
    }

    const openRequest = await client.query(
      `SELECT id, status
       FROM society_join_requests
       WHERE society_id = $1
         AND user_id = $2
         AND status IN ('PENDING', 'INTERVIEW_SCHEDULED')
       ORDER BY created_at DESC
       LIMIT 1`,
      [societyId, user.userId],
    );

    if (openRequest.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: "You already have an active join request",
          status: openRequest.rows[0].status,
        },
        { status: 409 },
      );
    }

    const insertResult = await client.query(
      `INSERT INTO society_join_requests (society_id, user_id, status, application_data)
       VALUES ($1, $2, 'PENDING', $3::jsonb)
       RETURNING id, status, created_at`,
      [societyId, user.userId, JSON.stringify(applicationData)],
    );

    const requestRow = insertResult.rows[0];

    const presidentResult = await client.query(
      `SELECT sm.user_id
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.society_id = $1
         AND sm.is_active = TRUE
         AND sm.suspended_at IS NULL
         AND r.name = 'President'
       LIMIT 1`,
      [societyId],
    );

    if (presidentResult.rows.length > 0) {
      await client.query(
        `INSERT INTO notifications (user_id, title, body, link)
         VALUES ($1, $2, $3, $4)`,
        [
          presidentResult.rows[0].user_id,
          "New Join Request",
          `${user.fullName} submitted a request to join ${society.name}.`,
          `/society/${societyId}/members`,
        ],
      );
    }

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        request: {
          id: requestRow.id,
          status: requestRow.status,
          created_at: requestRow.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Submit join request error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to submit join request";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}

// GET /api/societies/[id]/join-requests
// President/superadmin fetches join requests.
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
    const statusFilter = (
      req.nextUrl.searchParams.get("status") || "OPEN"
    ).toUpperCase();

    await ensureSocietyJoinRequestsTable(client);

    const authorized = await isPresidentOrSuperAdmin(
      user.userId,
      societyId,
      client,
      user.userType,
    );

    if (!authorized) {
      return NextResponse.json(
        { error: "Only President can review join requests" },
        { status: 403 },
      );
    }

    let whereStatus = "";
    if (statusFilter === "OPEN") {
      whereStatus = "AND jr.status IN ('PENDING', 'INTERVIEW_SCHEDULED')";
    } else if (
      [
        "PENDING",
        "INTERVIEW_SCHEDULED",
        "APPROVED",
        "REJECTED",
        "WITHDRAWN",
      ].includes(statusFilter)
    ) {
      whereStatus = "AND jr.status = $2";
    }

    const paramsList: unknown[] = [societyId];
    if (whereStatus && whereStatus.includes("$2")) {
      paramsList.push(statusFilter);
    }

    const result = await client.query(
      `SELECT jr.id, jr.status, jr.application_data, jr.review_notes,
              jr.reviewed_by, jr.reviewed_at,
              jr.interview_scheduled_at, jr.interview_mode,
              jr.interview_location, jr.interview_meeting_link, jr.interview_notes,
              jr.created_at, jr.updated_at,
              u.id AS user_id, u.full_name, u.email, u.avatar_url,
              ru.full_name AS reviewed_by_name
       FROM society_join_requests jr
       JOIN users u ON u.id = jr.user_id
       LEFT JOIN users ru ON ru.id = jr.reviewed_by
       WHERE jr.society_id = $1
         ${whereStatus}
       ORDER BY jr.created_at DESC`,
      paramsList,
    );

    return NextResponse.json({ requests: result.rows });
  } catch (error) {
    console.error("Get join requests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch join requests" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
