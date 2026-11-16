export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/[id] — detailed user profile with memberships, events, audit
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, resolveMediaFields } from "@/lib/blob";
import { ApiErrors, writeAuditLog } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = params;

    const [userResult, memberships, events, auditLogs] = await Promise.all([
      query(
        `SELECT id, email, full_name, user_type, status, avatar_url, created_at, designation, cms_id, email_verified_at, last_login_at
         FROM users WHERE id = $1`,
        [id],
      ),
      query(
        `SELECT sm.society_id,
                s.name AS society_name,
                r.name AS role,
                sm.is_active,
                sm.assigned_at AS joined_at
         FROM society_memberships sm
         JOIN societies s ON s.id = sm.society_id
         JOIN roles r ON r.id = sm.role_id
         WHERE sm.user_id = $1
         ORDER BY sm.assigned_at DESC`,
        [id],
      ),
      query(
        `SELECT t.event_id,
          e.title AS event_title,
          s.name AS society_name,
          t.purchased_at AS registered_at,
          t.status
         FROM tickets t
         JOIN events e ON e.id = t.event_id
         JOIN societies s ON s.id = e.society_id
         WHERE t.user_id = $1
         ORDER BY t.purchased_at DESC
         LIMIT 20`,
        [id],
      ),
      query(
        `SELECT al.id, al.action, al.performed_by,
                u.full_name AS performed_by_name,
                u.email AS performed_by_email,
                al.society_id, s.name AS society_name,
                al.target_type, al.target_id,
                al.old_value, al.new_value, al.metadata,
                al.ip_address, al.created_at
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.performed_by
         LEFT JOIN societies s ON s.id = al.society_id
         WHERE al.performed_by = $1
         ORDER BY al.created_at DESC
         LIMIT 30`,
        [id],
      ),
    ]);

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userWithResolvedMedia = resolveMediaFields(userResult.rows[0], {
      avatar_url: CONTAINERS.PROFILE_PICTURES,
    });

    return NextResponse.json({
      ...userWithResolvedMedia,
      memberships: memberships.rows,
      events: events.rows,
      auditLogs: auditLogs.rows,
    });
  } catch (error) {
    console.error("Admin user detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user detail" },
      { status: 500 },
    );
  }
}

const DESIGNATIONS = ["STUDENT", "FACULTY", "STAFF", "PRINCIPAL"];

/**
 * PATCH /api/admin/users/[id] { designation }
 * Super admins mark accounts as Faculty / Staff / Principal. The Principal gives
 * final approval on forwarded minutes (FR-MIN-04).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const designation = String(body.designation || "").toUpperCase();
    if (!DESIGNATIONS.includes(designation)) {
      return NextResponse.json({ error: "designation must be STUDENT, FACULTY, STAFF or PRINCIPAL" }, { status: 400 });
    }
    const updated = await query(
      "UPDATE users SET designation = $2, updated_at = NOW() WHERE id = $1 RETURNING id, designation",
      [params.id, designation],
    );
    if (updated.rows.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await writeAuditLog({
      action: "USER_DESIGNATION_CHANGED",
      performedBy: user.userId,
      targetType: "user",
      targetId: params.id,
      newValue: { designation },
    });
    return NextResponse.json({ success: true, designation });
  } catch (error) {
    return ApiErrors.serverError("Set designation error:", error);
  }
}
