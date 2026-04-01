export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import crypto from "crypto";
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  checkApiRateLimit,
  checkSocietyOperational,
  checkBlackoutPeriod,
  resolveEffectiveSocietyPrivilege,
} from "@/lib/api-utils";

/**
 * POST /api/societies/[id]/events
 *
 * Create a new event for a society.
 *
 * Authorization:
 *   - Must have CREATE_EVENT privilege (via fn_has_privilege)
 *   - Society must be APPROVED (checked by fn_has_privilege)
 *
 * Body:
 *   title (required), description, location, venue_details,
 *   event_start (required), event_end (required),
 *   registration_start, registration_end,
 *   is_paid, ticket_price, max_tickets, max_participants,
 *   category_id, wing_id, portfolio_id,
 *   banner_url, thumbnail_url (required),
 *   visibility (PUBLIC|MEMBERS_ONLY), transfer_deadline
 *
 * Auto-behavior:
 *   - registration_link auto-generated
 *   - status auto-calculated by DB trigger (fn_calculate_event_status)
 *   - version = 1
 *   - created_by = current user
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const { id: societyId } = params;
    const ip = extractIpAddress(req);

    // Rate limit: max 5 event creations per minute per user
    const rateLimited = checkApiRateLimit(user.userId, "create-event", 5);
    if (rateLimited) return rateLimited;

    const body = await req.json();
    const location = body.location ?? body.venue ?? null;
    const registrationEnd =
      body.registration_end ?? body.registration_deadline ?? null;
    const requestNustAdminCohost = Boolean(
      body.request_nust_administration_cohost,
    );
    const requestedSocietyCohostIds = Array.isArray(
      body.cohost_society_request_ids,
    )
      ? body.cohost_society_request_ids
          .filter((value: unknown): value is string => typeof value === "string")
          .map((value: string) => value.trim())
          .filter((value: string) => value.length > 0)
      : [];
    const cohostRequestReason =
      typeof body.cohost_request_reason === "string"
        ? body.cohost_request_reason.trim() || null
        : null;
    const rawTicketPrice = body.ticket_price;
    const normalizedTicketPrice =
      rawTicketPrice === undefined ||
      rawTicketPrice === null ||
      rawTicketPrice === ""
        ? null
        : Number(rawTicketPrice);

    if (
      normalizedTicketPrice !== null &&
      (Number.isNaN(normalizedTicketPrice) || normalizedTicketPrice < 0)
    ) {
      return NextResponse.json(
        { error: "ticket_price must be a non-negative number" },
        { status: 400 },
      );
    }

    const derivedIsPaid =
      normalizedTicketPrice !== null && normalizedTicketPrice > 0;

    // ── Required field validation ─────────────────────────────────────
    const { title, event_start, event_end, thumbnail_url } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!event_start) {
      return NextResponse.json(
        { error: "event_start is required" },
        { status: 400 },
      );
    }
    if (!event_end) {
      return NextResponse.json(
        { error: "event_end is required" },
        { status: 400 },
      );
    }
    if (!thumbnail_url || !thumbnail_url.trim()) {
      return NextResponse.json(
        { error: "thumbnail_url is required" },
        { status: 400 },
      );
    }

    // ── Date validations ──────────────────────────────────────────────
    const startDate = new Date(event_start);
    const endDate = new Date(event_end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format for event_start or event_end" },
        { status: 400 },
      );
    }
    if (endDate < startDate) {
      return NextResponse.json(
        { error: "event_end must be >= event_start" },
        { status: 400 },
      );
    }

    if (registrationEnd) {
      const regEnd = new Date(registrationEnd);
      if (isNaN(regEnd.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format for registration_end" },
          { status: 400 },
        );
      }
      if (regEnd > startDate) {
        return NextResponse.json(
          { error: "registration_end must be <= event_start" },
          { status: 400 },
        );
      }
    }

    // ── max_participants validation ───────────────────────────────────
    if (body.max_participants !== undefined && body.max_participants !== null) {
      if (
        !Number.isInteger(body.max_participants) ||
        body.max_participants < 1
      ) {
        return NextResponse.json(
          { error: "max_participants must be an integer >= 1" },
          { status: 400 },
        );
      }
    }

    await client.query("BEGIN");

    // ── Society operational check ─────────────────────────────────────
    const societyCheck = await checkSocietyOperational(societyId, client);
    if (societyCheck) {
      await client.query("ROLLBACK");
      return societyCheck;
    }

    // ── Authorization: effective privilege (role grant or member override) ──
    const effectivePrivilege = await resolveEffectiveSocietyPrivilege(
      {
        userId: user.userId,
        societyId,
        privilegeName: "CREATE_EVENT",
        wingId: body.wing_id || null,
        portfolioId: body.portfolio_id || null,
      },
      client,
    );

    const allowedByPolicy = effectivePrivilege.allowed;

    if (!allowedByPolicy && user.userType !== "SUPER_ADMIN") {
      await client.query("ROLLBACK");
      return ApiErrors.forbidden(
        "You are not allowed to create events for this society",
      );
    }

    // ── Blackout period check ─────────────────────────────────────────
    const blackoutError = await checkBlackoutPeriod(startDate, endDate, client);
    if (blackoutError) {
      await client.query("ROLLBACK");
      return ApiErrors.conflict(blackoutError);
    }

    // ── Verify society exists & is APPROVED (double-check) ────────────
    const society = await client.query(
      `SELECT id, name, status FROM societies WHERE id = $1`,
      [societyId],
    );
    if (society.rows.length === 0) {
      await client.query("ROLLBACK");
      return ApiErrors.notFound("Society");
    }
    if (
      society.rows[0].status !== "APPROVED" &&
      user.userType !== "SUPER_ADMIN"
    ) {
      await client.query("ROLLBACK");
      return ApiErrors.conflict("Society is not active");
    }

    // ── Auto-generate registration link ───────────────────────────────
    const registrationLink = `evt-${crypto.randomBytes(12).toString("hex")}`;

    // ── Insert event ──────────────────────────────────────────────────
    const insertResult = await client.query(
      `INSERT INTO events (
          society_id, wing_id, portfolio_id, category_id,
          title, description, location, venue_details,
          is_paid, ticket_price, max_tickets, max_participants,
          event_start, event_end, registration_start, registration_end,
          transfer_deadline, banner_url, thumbnail_url,
          visibility, registration_link, version, created_by
       ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19,
          $20, $21, 1, $22
       ) RETURNING id, status, registration_link, version`,
      [
        societyId,
        body.wing_id || null,
        body.portfolio_id || null,
        body.category_id || null,
        title.trim(),
        body.description || null,
        location,
        body.venue_details || null,
        derivedIsPaid,
        normalizedTicketPrice,
        body.max_tickets ?? null,
        body.max_participants ?? null,
        event_start,
        event_end,
        body.registration_start || null,
        registrationEnd,
        body.transfer_deadline || null,
        body.banner_url || null,
        thumbnail_url.trim(),
        body.visibility || "PUBLIC",
        registrationLink,
        user.userId,
      ],
    );

    const newEvent = insertResult.rows[0];

    if (requestNustAdminCohost || requestedSocietyCohostIds.length > 0) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS platform_cohost_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_id UUID NOT NULL REFERENCES events(id),
          requesting_society_id UUID NOT NULL REFERENCES societies(id),
          host_society_id UUID NOT NULL REFERENCES societies(id),
          requested_by UUID NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'PENDING',
          reason TEXT,
          admin_note TEXT,
          approved_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ,
          request_type TEXT NOT NULL DEFAULT 'SOCIETY' CHECK (request_type IN ('SOCIETY', 'NUST_ADMIN')),
          cohost_society_id UUID REFERENCES societies(id),
          decided_at TIMESTAMPTZ
        )
      `);

      if (requestNustAdminCohost) {
        await client.query(
          `INSERT INTO platform_cohost_requests (
             event_id,
             requesting_society_id,
             host_society_id,
             requested_by,
             status,
             reason,
             request_type,
             cohost_society_id
           )
           VALUES ($1, $2, $3, $4, 'PENDING', $5, 'NUST_ADMIN', NULL)
           ON CONFLICT DO NOTHING`,
          [newEvent.id, societyId, societyId, user.userId, cohostRequestReason],
        );
      }

      const uniqueSocietyTargets = Array.from(
        new Set(
          requestedSocietyCohostIds.filter(
            (targetId: string) => targetId !== societyId,
          ),
        ),
      );

      if (uniqueSocietyTargets.length > 0) {
        const approvedSocieties = await client.query(
          `SELECT id
           FROM societies
           WHERE id = ANY($1::uuid[])
             AND status = 'APPROVED'
             AND deleted_at IS NULL`,
          [uniqueSocietyTargets],
        );

        for (const row of approvedSocieties.rows) {
          await client.query(
            `INSERT INTO platform_cohost_requests (
               event_id,
               requesting_society_id,
               host_society_id,
               requested_by,
               status,
               reason,
               request_type,
               cohost_society_id
             )
             VALUES ($1, $2, $3, $4, 'PENDING', $5, 'SOCIETY', $6)
             ON CONFLICT DO NOTHING`,
            [newEvent.id, societyId, societyId, user.userId, cohostRequestReason, row.id],
          );
        }
      }

      await client.query(
        `INSERT INTO notifications (user_id, title, body, link)
         SELECT id, $1, $2, $3
         FROM users
         WHERE user_type = 'SUPER_ADMIN'`,
        [
          "Co-Host Request Submitted",
          `${society.rows[0].name} submitted co-host request(s) for event \"${title.trim()}\"`,
          "/platform/cohost-requests",
        ],
      );
    }

    // ── Audit log with IP ─────────────────────────────────────────────
    await writeAuditLog(
      {
        action: "EVENT_CREATED",
        performedBy: user.userId,
        societyId,
        targetType: "event",
        targetId: newEvent.id,
        newValue: {
          title: title.trim(),
          event_start,
          event_end,
          status: newEvent.status,
        },
        metadata: { createdBy: user.fullName, registrationLink },
        ipAddress: ip,
      },
      client,
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        event: {
          id: newEvent.id,
          status: newEvent.status,
          registration_link: newEvent.registration_link,
          version: newEvent.version,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK");

    const dbError = error as {
      code?: string;
      message?: string;
      detail?: string;
      constraint?: string;
    };

    if (dbError.code === "23514") {
      // CHECK constraint violation
      return ApiErrors.validation(
        dbError.detail || dbError.message || "Event validation failed",
      );
    }
    if (dbError.code === "23503") {
      // FK violation
      return ApiErrors.validation(
        "Invalid reference provided (category, wing, portfolio, or creator)",
      );
    }
    if (dbError.code === "22P02") {
      // Invalid text representation (e.g., malformed UUID/timestamp)
      return ApiErrors.validation(
        "Invalid identifier or date format in event payload",
      );
    }

    return ApiErrors.serverError("Create event error:", error);
  } finally {
    client.release();
  }
}
