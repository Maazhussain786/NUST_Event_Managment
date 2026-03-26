export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dispatchEventReminderPushNotifications } from "@/lib/push-reminders";

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && expectedSecret && cronSecret === expectedSecret);
}

// POST /api/cron/push-event-reminders
// Dispatches event reminder notifications:
// - event starting soon
// - registration closing soon
// - limited seats left
export async function POST(req: NextRequest) {
  try {
    let isAuthorized = isCronAuthorized(req);

    if (!isAuthorized) {
      const user = await getCurrentUser();
      isAuthorized = user?.userType === "SUPER_ADMIN";
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await dispatchEventReminderPushNotifications();

    return NextResponse.json({
      success: true,
      ...result,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Push reminder dispatch error:", error);
    return NextResponse.json(
      { error: "Failed to dispatch push reminders" },
      { status: 500 },
    );
  }
}
