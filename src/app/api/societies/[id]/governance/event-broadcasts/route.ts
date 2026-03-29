export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resolveEffectiveSocietyPrivilege } from "@/lib/api-utils";
import {
  createEventBroadcast,
  EVENT_BROADCAST_SEVERITIES,
  EVENT_BROADCAST_TARGET_SCOPES,
  EVENT_BROADCAST_UPDATE_TYPES,
  listEventBroadcasts,
} from "@/lib/event-broadcasts";

interface PermissionCheckResult {
  canRead: boolean;
  canManage: boolean;
}

async function checkSocietyBroadcastPermissions(
  userId: string,
  userType: "SUPER_ADMIN" | "STUDENT",
  societyId: string,
): Promise<PermissionCheckResult> {
  if (userType === "SUPER_ADMIN") {
    return { canRead: true, canManage: true };
  }

  const memberResult = await query(
    `SELECT 1
     FROM society_memberships sm
     WHERE sm.user_id = $1
       AND sm.society_id = $2
       AND sm.is_active = TRUE
       AND sm.suspended_at IS NULL
     LIMIT 1`,
    [userId, societyId],
  );

  if (memberResult.rows.length === 0) {
    return { canRead: false, canManage: false };
  }

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

  return {
    canRead: true,
    canManage: editEvent.allowed || manageContent.allowed,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: societyId } = await params;
    const permissions = await checkSocietyBroadcastPermissions(
      user.userId,
      user.userType,
      societyId,
    );
    if (!permissions.canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const broadcasts = await listEventBroadcasts({
      societyId,
      eventId,
      limit,
    });

    return NextResponse.json({
      broadcasts,
      options: {
        updateTypes: EVENT_BROADCAST_UPDATE_TYPES,
        severities: EVENT_BROADCAST_SEVERITIES,
        targetScopes: EVENT_BROADCAST_TARGET_SCOPES,
      },
      permissions,
    });
  } catch (error) {
    console.error("List event broadcasts error:", error);
    return NextResponse.json(
      { error: "Failed to load event broadcasts" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: societyId } = await params;
    const permissions = await checkSocietyBroadcastPermissions(
      user.userId,
      user.userType,
      societyId,
    );
    if (!permissions.canManage) {
      return NextResponse.json(
        { error: "You do not have permission to send event updates." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const result = await createEventBroadcast({
      societyId,
      eventId: String(body.eventId || ""),
      createdBy: user.userId,
      title: body.title,
      message: body.message,
      updateType: body.updateType,
      severity: body.severity,
      targetScope: body.targetScope,
      includeInApp:
        typeof body.includeInApp === "boolean" ? body.includeInApp : true,
      includePush: typeof body.includePush === "boolean" ? body.includePush : true,
      scheduledAt: body.scheduledAt || null,
      metadata: body.metadata ?? null,
    });

    return NextResponse.json({
      success: true,
      dispatched: result.dispatched,
      dispatch: result.dispatchResult || null,
      broadcast: result.broadcast,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = /required|at most|not found|Select at least/i.test(message)
      ? 400
      : 500;
    if (status === 500) {
      console.error("Create event broadcast error:", error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
