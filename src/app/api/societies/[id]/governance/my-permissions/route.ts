export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resolveEffectiveSocietyPrivilege } from "@/lib/api-utils";

// GET /api/societies/[id]/governance/my-permissions
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: societyId } = params;

    if (user.userType === "SUPER_ADMIN") {
      return NextResponse.json({
        can_create_event: true,
        can_manage_content: true,
        can_upload_media: true,
      });
    }

    const roleLevelMap: Record<string, number> = {
      President: 10,
      "Vice President": 8,
      Director: 5,
      "Deputy Director": 3,
      Member: 1,
    };

    const roleData = await query(
      `SELECT r.name AS role_name,
              ss.event_creation_role,
              ss.content_upload_role
       FROM society_memberships sm
       JOIN roles r ON r.id = sm.role_id
       LEFT JOIN society_settings ss ON ss.society_id = sm.society_id
       WHERE sm.user_id = $1
         AND sm.society_id = $2
         AND sm.is_active = TRUE
         AND sm.suspended_at IS NULL
       ORDER BY r.hierarchy_level DESC
       LIMIT 1`,
      [user.userId, societyId],
    );

    if (roleData.rows.length === 0) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const myRole = roleData.rows[0].role_name as string;
    const eventCreationRole =
      (roleData.rows[0].event_creation_role as string) || "Director";
    const contentUploadRole =
      (roleData.rows[0].content_upload_role as string) || "Deputy Director";

    const eventPriv = await resolveEffectiveSocietyPrivilege({
      userId: user.userId,
      societyId,
      privilegeName: "CREATE_EVENT",
    });

    const manageContentPriv = await resolveEffectiveSocietyPrivilege({
      userId: user.userId,
      societyId,
      privilegeName: "MANAGE_CONTENT",
    });

    const uploadMediaPriv = await resolveEffectiveSocietyPrivilege({
      userId: user.userId,
      societyId,
      privilegeName: "UPLOAD_MEDIA",
    });

    const uploadContentPriv = await resolveEffectiveSocietyPrivilege({
      userId: user.userId,
      societyId,
      privilegeName: "UPLOAD_CONTENT",
    });

    const meetsEventRole =
      (roleLevelMap[myRole] || 0) >= (roleLevelMap[eventCreationRole] || 5);
    const meetsContentRole =
      (roleLevelMap[myRole] || 0) >= (roleLevelMap[contentUploadRole] || 3);

    const canCreateEvent =
      eventPriv.source === "override"
        ? eventPriv.allowed
        : eventPriv.allowed && meetsEventRole;

    const canManageContent =
      (manageContentPriv.source === "override"
        ? manageContentPriv.allowed
        : manageContentPriv.allowed && meetsContentRole) ||
      (uploadMediaPriv.source === "override"
        ? uploadMediaPriv.allowed
        : uploadMediaPriv.allowed && meetsContentRole) ||
      (uploadContentPriv.source === "override"
        ? uploadContentPriv.allowed
        : uploadContentPriv.allowed && meetsContentRole);

    return NextResponse.json({
      can_create_event: canCreateEvent,
      can_manage_content: canManageContent,
      can_upload_media: canManageContent,
      role_name: myRole,
      required_event_role: eventCreationRole,
      required_content_role: contentUploadRole,
    });
  } catch (error) {
    console.error("My permissions error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
