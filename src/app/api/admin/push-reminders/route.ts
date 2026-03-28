export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  dispatchEventReminderPushNotifications,
  getPushReminderStats,
  previewEventReminderPushCandidates,
  retryPushReminderDispatch,
} from "@/lib/push-reminders";

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "SUPER_ADMIN") {
    return null;
  }
  return user;
}

// GET /api/admin/push-reminders?days=7
export async function GET(req: NextRequest) {
  try {
    const user = await requireSuperAdmin();
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get("days") || "7");
    const days = Number.isFinite(daysRaw) ? daysRaw : 7;
    const stats = await getPushReminderStats(days);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Push reminder stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch push reminder stats" },
      { status: 500 },
    );
  }
}

// POST /api/admin/push-reminders
// Actions:
// - { action: "dispatch" }
// - { action: "dry-run" }
// - { action: "retry", ...filters }
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin();
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "dispatch";

    if (action === "dispatch") {
      const result = await dispatchEventReminderPushNotifications();
      return NextResponse.json({ success: true, action, result });
    }

    if (action === "dry-run") {
      const result = await previewEventReminderPushCandidates();
      return NextResponse.json({ success: true, action, result });
    }

    if (action === "retry") {
      const retry = await retryPushReminderDispatch({
        statuses: Array.isArray(body?.statuses) ? body.statuses : undefined,
        lookbackHours:
          typeof body?.lookbackHours === "number"
            ? body.lookbackHours
            : undefined,
        limit: typeof body?.limit === "number" ? body.limit : undefined,
        eventId: typeof body?.eventId === "string" ? body.eventId : undefined,
        userId: typeof body?.userId === "string" ? body.userId : undefined,
        notificationType:
          typeof body?.notificationType === "string"
            ? body.notificationType
            : undefined,
      });

      return NextResponse.json({ success: true, action, result: retry });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Push reminder operation error:", error);
    return NextResponse.json(
      { error: "Failed to process push reminder operation" },
      { status: 500 },
    );
  }
}
