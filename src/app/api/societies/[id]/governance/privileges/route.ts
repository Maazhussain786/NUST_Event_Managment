export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureMemberPrivilegeOverridesTable } from "@/lib/api-utils";

// PATCH /api/societies/[id]/governance/privileges
// Supports:
// - role-level privilege toggle (roleId + privilegeKey + granted)
// - member-level privilege override (membershipId + privilegeKey + granted)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: societyId } = params;
    const body = await req.json();
    const { membershipId, roleId, privilegeKey, granted } = body;

    if (
      (!membershipId && !roleId) ||
      !privilegeKey ||
      typeof granted !== "boolean"
    ) {
      return NextResponse.json(
        {
          error:
            "roleId or membershipId, privilegeKey, and granted are required",
        },
        { status: 400 },
      );
    }

    await client.query("BEGIN");
    await ensureMemberPrivilegeOverridesTable(client);

    // Verify requester is President (or super admin)
    const membership = await client.query(
      `SELECT r.hierarchy_level, r.name AS role_name FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
         AND sm.suspended_at IS NULL
       ORDER BY r.hierarchy_level DESC
       LIMIT 1`,
      [user.userId, societyId],
    );

    if (membership.rows.length === 0 && user.userType !== "SUPER_ADMIN") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const requesterLevel = Number(
      membership.rows[0]?.hierarchy_level ||
        (user.userType === "SUPER_ADMIN" ? 10 : 0),
    );
    const requesterRoleName = membership.rows[0]?.role_name || null;

    if (user.userType !== "SUPER_ADMIN" && requesterRoleName !== "President") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Only President can manage permissions" },
        { status: 403 },
      );
    }

    // Get privilege ID
    const privResult = await client.query(
      `SELECT id FROM privileges WHERE name = $1`,
      [privilegeKey],
    );
    if (privResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Privilege not found" },
        { status: 404 },
      );
    }

    const privilegeId = privResult.rows[0].id;

    let auditAction = granted ? "PRIVILEGE_GRANTED" : "PRIVILEGE_REVOKED";
    let auditTargetType = "role_privilege";
    let auditTargetId = roleId as string;
    let auditMetaRole = "";

    if (membershipId) {
      const targetMember = await client.query(
        `SELECT sm.id, sm.role_id, r.name AS role_name, r.hierarchy_level
         FROM society_memberships sm
         JOIN roles r ON sm.role_id = r.id
         WHERE sm.id = $1
           AND sm.society_id = $2
           AND sm.is_active = TRUE
           AND sm.suspended_at IS NULL`,
        [membershipId, societyId],
      );

      if (targetMember.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Member not found" },
          { status: 404 },
        );
      }

      const target = targetMember.rows[0];
      const targetRoleLevel = Number(target.hierarchy_level || 0);

      if (
        targetRoleLevel >= requesterLevel &&
        user.userType !== "SUPER_ADMIN"
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Cannot modify privileges of equal or higher rank" },
          { status: 403 },
        );
      }

      if (target.role_name === "President") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "President permissions are protected" },
          { status: 403 },
        );
      }

      await client.query(
        `INSERT INTO society_member_privilege_overrides (membership_id, privilege_id, is_granted, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (membership_id, privilege_id)
         DO UPDATE SET is_granted = EXCLUDED.is_granted,
                       granted_by = EXCLUDED.granted_by,
                       updated_at = NOW()`,
        [target.id, privilegeId, granted, user.userId],
      );

      auditTargetType = "member_privilege_override";
      auditTargetId = target.id;
      auditMetaRole = target.role_name;
    } else {
      const targetRole = await client.query(
        `SELECT id, name, hierarchy_level
         FROM roles
         WHERE id = $1 AND society_id = $2`,
        [roleId, societyId],
      );

      if (targetRole.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Role not found in this society" },
          { status: 404 },
        );
      }

      const role = targetRole.rows[0];
      const targetRoleLevel = Number(role.hierarchy_level || 0);

      if (
        targetRoleLevel >= requesterLevel &&
        user.userType !== "SUPER_ADMIN"
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Cannot modify privileges of equal or higher rank" },
          { status: 403 },
        );
      }

      if (role.name === "President") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "President permissions are protected" },
          { status: 403 },
        );
      }

      if (granted) {
        await client.query(
          `INSERT INTO role_privileges (role_id, privilege_id)
           VALUES ($1, $2)
           ON CONFLICT (role_id, privilege_id) DO NOTHING`,
          [role.id, privilegeId],
        );
      } else {
        await client.query(
          `DELETE FROM role_privileges WHERE role_id = $1 AND privilege_id = $2`,
          [role.id, privilegeId],
        );
      }

      auditTargetType = "role_privilege";
      auditTargetId = role.id;
      auditMetaRole = role.name;
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        auditAction,
        user.userId,
        societyId,
        auditTargetType,
        auditTargetId,
        JSON.stringify({ privilege: privilegeKey, granted }),
        JSON.stringify({
          role: auditMetaRole,
          by: user.fullName,
          scope: membershipId ? "membership" : "role",
        }),
      ],
    );

    await client.query("COMMIT");

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update privilege error:", error);
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
