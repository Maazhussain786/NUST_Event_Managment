export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureMemberPrivilegeOverridesTable } from "@/lib/api-utils";

// GET /api/societies/[id]/governance/privileges/[membershipId] — get role privileges for a member
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; membershipId: string } },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: societyId, membershipId } = params;
    await ensureMemberPrivilegeOverridesTable(client);

    // Verify requester is President (or super admin)
    const membership = await client.query(
      `SELECT r.hierarchy_level, r.name AS role_name FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId],
    );
    if (membership.rows.length === 0 && user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const isPresident = membership.rows.some(
      (m: { role_name: string }) => m.role_name === "President",
    );
    if (!isPresident && user.userType !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only President can view member-specific permissions" },
        { status: 403 },
      );
    }

    // Get the target member's role
    const targetMember = await client.query(
      `SELECT sm.id, sm.role_id, r.name AS role_name, r.hierarchy_level,
              u.full_name, u.email
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       JOIN users u ON sm.user_id = u.id
       WHERE sm.id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [membershipId, societyId],
    );
    if (targetMember.rows.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const member = targetMember.rows[0];

    // Get all privileges
    const privilegesResult = await client.query(
      `SELECT p.id,
              p.name,
              p.description,
              (rp.privilege_id IS NOT NULL) AS role_granted,
              mpo.is_granted AS override_granted
       FROM privileges p
       LEFT JOIN role_privileges rp
         ON rp.privilege_id = p.id
        AND rp.role_id = $1
       LEFT JOIN society_member_privilege_overrides mpo
         ON mpo.privilege_id = p.id
        AND mpo.membership_id = $2
       ORDER BY p.name ASC`,
      [member.role_id, member.id],
    );

    const privileges = privilegesResult.rows.map((p: any) => {
      const hasOverride =
        p.override_granted === true || p.override_granted === false;
      return {
        privilege_key: p.name,
        label: p.name.replace(/_/g, " "),
        description: p.description,
        granted: hasOverride ? p.override_granted : p.role_granted,
      };
    });

    return NextResponse.json({
      membership_id: member.id,
      role_name: member.role_name,
      user_name: member.full_name,
      email: member.email,
      privileges,
    });
  } catch (error) {
    console.error("Get privileges error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
