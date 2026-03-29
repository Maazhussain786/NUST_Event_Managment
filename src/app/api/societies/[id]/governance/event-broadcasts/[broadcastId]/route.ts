export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resolveEffectiveSocietyPrivilege } from "@/lib/api-utils";
import {
  cancelEventBroadcast,
  dispatchEventBroadcastById,
  getEventBroadcastById,
} from "@/lib/event-broadcasts";

async function canManageBroadcasts(
  userId: string,
  userType: "SUPER_ADMIN" | "STUDENT",
  societyId: string,
): Promise<boolean> {
  if (userType === "SUPER_ADMIN") return true;

  const membership = await query(
    `SELECT 1
     FROM society_memberships sm
     WHERE sm.user_id = $1
       AND sm.society_id = $2
       AND sm.is_active = TRUE
       AND sm.suspended_at IS NULL
     LIMIT 1`,
    [userId, societyId],
  );
  if (membership.rows.length === 0) return false;

  const [editEvent, manageContent] = await Promise.all([
    resolveEffectiveSocietyPrivilege({
      userId,
      societyId,
      privilegeName: "EDIT_EVENT",
    }),
    resolveEffectiveSocietyPrivilege({
      userId,
      societyId,
      privilegeName: "MANAGE_CONTENT",
    }),
  ]);

  return editEvent.allowed || manageContent.allowed;
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; broadcastId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: societyId, broadcastId } = await params;
    const allowed = await canManageBroadcasts(
      user.userId,
      user.userType,
      societyId,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have permission to modify event updates." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const action =
      typeof body.action === "string" ? body.action.trim().toUpperCase() : "";

    if (action === "CANCEL") {
      const cancelled = await cancelEventBroadcast({
        societyId,
        broadcastId,
        cancelledBy: user.userId,
      });
      if (!cancelled.ok) {
        return NextResponse.json(
          { error: cancelled.reason || "Unable to cancel update." },
          { status: 409 },
        );
      }
      return NextResponse.json({ success: true, broadcast: cancelled.broadcast });
    }

    if (action === "SEND_NOW") {
      const dispatchResult = await dispatchEventBroadcastById(broadcastId, {
        actorUserId: user.userId,
      });
      if (!dispatchResult.ok) {
        return NextResponse.json(
          { error: dispatchResult.reason || "Failed to send update." },
          { status: 409 },
        );
      }

      const broadcast = await getEventBroadcastById({ societyId, broadcastId });
      return NextResponse.json({
        success: true,
        dispatch: dispatchResult,
        broadcast,
      });
    }

    return NextResponse.json(
      { error: "Unsupported action. Use CANCEL or SEND_NOW." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Update event broadcast error:", error);
    return NextResponse.json(
      { error: "Failed to update event broadcast" },
      { status: 500 },
    );
  }
}
