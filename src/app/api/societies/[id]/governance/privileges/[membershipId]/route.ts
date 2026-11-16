export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ApiErrors } from "@/lib/api-utils";
import { getSocietyAccess, can, canDefineOfficerPermissions, forbidden } from "@/lib/rbac";

// GET /api/societies/[id]/governance/privileges/[membershipId] — a member's effective permissions
export async function GET(req: NextRequest, { params }: { params: { id: string; membershipId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const { id: societyId, membershipId } = params;

    const access = await getSocietyAccess(user, societyId);
    if (!access) return ApiErrors.notFound("Society");
    const canEdit = await canDefineOfficerPermissions(access);
    if (!canEdit && !can(access, "MANAGE_ROLES")) return forbidden("You cannot view member permissions.");

    const target = await query(
      `SELECT sm.id, sm.user_id, sm.role_id, r.name AS role_name, r.tier, u.full_name, u.email
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       JOIN users u ON sm.user_id = u.id
       WHERE sm.id = $1 AND sm.society_id = $2 AND sm.is_active`,
      [membershipId, societyId],
    );
    const member = target.rows[0];
    if (!member) return ApiErrors.notFound("Member");

    const privileges = await query(
      `SELECT p.name, COALESCE(p.label, INITCAP(REPLACE(p.name, '_', ' '))) AS label, p.description, p.module,
              (rp.privilege_id IS NOT NULL) AS role_granted,
              mpo.is_granted AS override_granted,
              fn_has_privilege($3, $4, p.name) AS effective
       FROM privileges p
       LEFT JOIN role_privileges rp ON rp.privilege_id = p.id AND rp.role_id = $1
       LEFT JOIN society_member_privilege_overrides mpo ON mpo.privilege_id = p.id AND mpo.membership_id = $2
       ORDER BY p.sort_order, p.name`,
      [member.role_id, member.id, member.user_id, societyId],
    );

    return NextResponse.json({
      membership_id: member.id,
      role_name: member.role_name,
      tier: member.tier,
      user_name: member.full_name,
      email: member.email,
      full_access: member.tier === "FACULTY_SPONSOR" || member.tier === "ADMIN",
      editable: canEdit && member.tier !== "FACULTY_SPONSOR" && member.tier !== "ADMIN",
      privileges: privileges.rows.map((p) => ({
        privilege_key: p.name,
        label: p.label,
        description: p.description,
        module: p.module,
        role_granted: p.role_granted,
        override: p.override_granted === null ? null : Boolean(p.override_granted),
        granted: Boolean(p.effective),
      })),
    });
  } catch (error) {
    return ApiErrors.serverError("Get privileges error:", error);
  }
}
