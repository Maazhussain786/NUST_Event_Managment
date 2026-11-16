export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ApiErrors } from "@/lib/api-utils";
import { getSocietyAccess, can, canDefineOfficerPermissions, isSocietyAdmin, TIER_LABELS } from "@/lib/rbac";

/**
 * GET /api/societies/[id]/governance/my-permissions
 * What the signed-in user may do in this society. Keeps the older can_* flags
 * used by existing screens and adds the full privilege list, tier and event roles.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const societyId = params.id;

    const access = await getSocietyAccess(user, societyId);
    if (!access) return ApiErrors.notFound("Society");
    if (!access.isMember && !access.isSuperAdmin) return ApiErrors.forbidden("Not a member");

    const teams = await query(
      `SELECT etm.event_id, e.title AS event_title, etm.team_id, p.name AS portfolio_name,
              p.function_key, etm.team_role
       FROM event_team_members etm
       JOIN events e ON e.id = etm.event_id AND e.deleted_at IS NULL AND e.archived_at IS NULL
       JOIN event_teams et ON et.id = etm.team_id AND et.is_active
       JOIN portfolios p ON p.id = et.portfolio_id
       WHERE etm.society_id = $1 AND etm.user_id = $2 AND etm.removed_at IS NULL
       ORDER BY e.event_start DESC`,
      [societyId, user.userId],
    );
    const headed = await query(
      `SELECT id, title FROM events
       WHERE society_id = $1 AND event_head_id = $2 AND deleted_at IS NULL AND archived_at IS NULL`,
      [societyId, user.userId],
    );

    const has = (p: string) => can(access, p);
    const canCreateEvent = has("CREATE_EVENT");
    const canEditEvent = has("EDIT_EVENT");
    const canCancelEvent = has("CANCEL_EVENT");
    const canUpload = has("UPLOAD_MEDIA") || has("UPLOAD_CONTENT");

    return NextResponse.json({
      // existing flags
      can_create_event: canCreateEvent,
      can_edit_event: canEditEvent,
      can_cancel_event: canCancelEvent,
      can_delete_event: canCancelEvent,
      can_manage_content: canUpload || has("DELETE_CONTENT"),
      can_upload_media: canUpload,
      can_scan_qr: has("SCAN_QR"),
      can_manage_events: canCreateEvent || canEditEvent || canCancelEvent,
      role_name: access.isSuperAdmin && !access.roleName ? "Super Admin" : access.roleName,
      // SRS role model
      tier: access.tier,
      tier_label: access.tier ? TIER_LABELS[access.tier] : access.isSuperAdmin ? "Super Admin" : null,
      level: access.level,
      is_admin: isSocietyAdmin(access),
      is_faculty_sponsor: access.tier === "FACULTY_SPONSOR",
      can_define_officer_permissions: await canDefineOfficerPermissions(access),
      privileges: Array.from(access.privileges).sort(),
      event_teams: teams.rows,
      event_head_of: headed.rows,
    });
  } catch (error) {
    return ApiErrors.serverError("My permissions error:", error);
  }
}
