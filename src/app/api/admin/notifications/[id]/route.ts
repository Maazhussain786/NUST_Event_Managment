export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/notifications/[id] — deactivate/delete a notification
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logSuperAdminAudit } from "@/lib/admin-audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const {
      title,
      body,
      priority,
      target_type,
      target_id,
      scheduled_at,
      expires_at,
    } = await req.json();

    const validPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
    const validTargets = ["ALL", "SOCIETY", "EVENT", "USER"];

    if (!title || !body) {
      return NextResponse.json(
        { error: "title and body are required" },
        { status: 400 },
      );
    }

    await query(
      `UPDATE platform_notifications
       SET title = $1,
           body = $2,
           priority = $3,
           target_type = $4,
           target_id = $5,
           scheduled_at = $6,
           expires_at = $7,
           is_active = true
       WHERE id = $8`,
      [
        title,
        body,
        validPriorities.includes(priority) ? priority : "NORMAL",
        validTargets.includes(target_type) ? target_type : "ALL",
        target_id || null,
        scheduled_at || null,
        expires_at || null,
        id,
      ],
    );

    await logSuperAdminAudit(req, user, {
      targetType: "NOTIFICATION",
      targetId: id,
      newValue: {
        title,
        priority: priority || "NORMAL",
        action: "EDITED",
      },
      metadata: {
        editedBy: user.email,
        target_type: target_type || "ALL",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update notification error:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    await query(
      "UPDATE platform_notifications SET is_active = false WHERE id = $1",
      [id],
    );

    await logSuperAdminAudit(_req, user, {
      targetType: "NOTIFICATION",
      targetId: id,
      metadata: { action: "DEACTIVATED", deactivatedBy: user.email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete notification error:", error);
    return NextResponse.json(
      { error: "Failed to delete notification" },
      { status: 500 },
    );
  }
}
