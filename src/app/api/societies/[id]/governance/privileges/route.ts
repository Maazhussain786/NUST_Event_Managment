export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ApiErrors, writeAuditLog } from "@/lib/api-utils";
import { getSocietyAccess, canDefineOfficerPermissions, outranks, forbidden } from "@/lib/rbac";

/**
 * PATCH /api/societies/[id]/governance/privileges  (FR-ROLE-03)
 * The Faculty Sponsor defines what each Officer role (and individual member) may do:
 *   - role toggle:   { roleId, privilegeKey, granted }
 *   - member toggle: { membershipId, privilegeKey, granted }   (per-person override)
 * Faculty Sponsor / Admin roles already have full access, so they are not editable.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const societyId = params.id;
    const { membershipId, roleId, privilegeKey, granted } = await req.json().catch(() => ({}));
    if ((!membershipId && !roleId) || !privilegeKey || typeof granted !== "boolean") {
      return ApiErrors.validation("roleId or membershipId, privilegeKey, and granted are required");
    }

    await client.query("BEGIN");
    const access = await getSocietyAccess(user, societyId, client);
    if (!access) {
      await client.query("ROLLBACK");
      return ApiErrors.notFound("Society");
    }
    if (!(await canDefineOfficerPermissions(access, client))) {
      await client.query("ROLLBACK");
      return forbidden("Only the Faculty Sponsor can change permissions.");
    }

    const privResult = await client.query(
      `SELECT id, name, name = ANY (fn_faculty_sponsor_only_privileges()) AS fs_only FROM privileges WHERE name = $1`,
      [privilegeKey],
    );
    const privilege = privResult.rows[0];
    if (!privilege) {
      await client.query("ROLLBACK");
      return ApiErrors.notFound("Privilege");
    }
    if (privilege.fs_only && granted) {
      await client.query("ROLLBACK");
      return forbidden("This permission belongs to the Faculty Sponsor only.");
    }

    let targetType: string;
    let targetId: string;
    let targetRoleName: string;

    if (membershipId) {
      const target = await client.query(
        `SELECT sm.id, r.name AS role_name, r.tier, r.hierarchy_level
         FROM society_memberships sm JOIN roles r ON sm.role_id = r.id
         WHERE sm.id = $1 AND sm.society_id = $2 AND sm.is_active AND sm.suspended_at IS NULL`,
        [membershipId, societyId],
      );
      const member = target.rows[0];
      if (!member) {
        await client.query("ROLLBACK");
        return ApiErrors.notFound("Member");
      }
      if (member.tier === "FACULTY_SPONSOR" || member.tier === "ADMIN") {
        await client.query("ROLLBACK");
        return forbidden(`${member.role_name} already has full access.`);
      }
      if (!outranks(access, member.hierarchy_level, member.tier)) {
        await client.query("ROLLBACK");
        return forbidden("You can only change permissions of members ranked below you.");
      }
      await client.query(
        `INSERT INTO society_member_privilege_overrides (membership_id, privilege_id, is_granted, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (membership_id, privilege_id)
         DO UPDATE SET is_granted = EXCLUDED.is_granted, granted_by = EXCLUDED.granted_by, updated_at = NOW()`,
        [member.id, privilege.id, granted, user.userId],
      );
      targetType = "member_privilege_override";
      targetId = member.id;
      targetRoleName = member.role_name;
    } else {
      const roleResult = await client.query(
        `SELECT id, name, tier, hierarchy_level FROM roles WHERE id = $1 AND society_id = $2`,
        [roleId, societyId],
      );
      const role = roleResult.rows[0];
      if (!role) {
        await client.query("ROLLBACK");
        return ApiErrors.notFound("Role");
      }
      if (role.tier === "FACULTY_SPONSOR" || role.tier === "ADMIN") {
        await client.query("ROLLBACK");
        return forbidden(`${role.name} already has full access.`);
      }
      if (granted) {
        await client.query(
          `INSERT INTO role_privileges (role_id, privilege_id, granted_by) VALUES ($1, $2, $3)
           ON CONFLICT (role_id, privilege_id) DO NOTHING`,
          [role.id, privilege.id, user.userId],
        );
      } else {
        await client.query(`DELETE FROM role_privileges WHERE role_id = $1 AND privilege_id = $2`, [role.id, privilege.id]);
      }
      targetType = "role_privilege";
      targetId = role.id;
      targetRoleName = role.name;
    }

    await writeAuditLog(
      {
        action: granted ? "PRIVILEGE_GRANTED" : "PRIVILEGE_REVOKED",
        performedBy: user.userId,
        societyId,
        targetType,
        targetId,
        newValue: { privilege: privilegeKey, granted },
        metadata: { role: targetRoleName, scope: membershipId ? "membership" : "role" },
      },
      client,
    );
    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return ApiErrors.serverError("Update privilege error:", error);
  } finally {
    client.release();
  }
}
