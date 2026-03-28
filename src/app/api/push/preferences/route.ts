export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getPushReminderPreferences,
  updatePushReminderPreferences,
} from "@/lib/push-notifications";
import { logServerError } from "@/lib/server-logger";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getPushReminderPreferences(user.userId);
    return NextResponse.json({ preferences });
  } catch (error) {
    logServerError("push.preferences.get", error);
    return NextResponse.json(
      { error: "Failed to fetch push preferences" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const patch: {
      eventStartingSoon?: boolean;
      registrationClosingSoon?: boolean;
      limitedSeatsLeft?: boolean;
    } = {};

    if (typeof body.eventStartingSoon === "boolean") {
      patch.eventStartingSoon = body.eventStartingSoon;
    }
    if (typeof body.registrationClosingSoon === "boolean") {
      patch.registrationClosingSoon = body.registrationClosingSoon;
    }
    if (typeof body.limitedSeatsLeft === "boolean") {
      patch.limitedSeatsLeft = body.limitedSeatsLeft;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "At least one preference field is required" },
        { status: 400 },
      );
    }

    const preferences = await updatePushReminderPreferences(user.userId, patch);
    return NextResponse.json({ preferences });
  } catch (error) {
    logServerError("push.preferences.patch", error);
    return NextResponse.json(
      { error: "Failed to update push preferences" },
      { status: 500 },
    );
  }
}
