export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dispatchScheduledEventBroadcasts } from "@/lib/event-broadcasts";

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && expectedSecret && cronSecret === expectedSecret);
}

// POST /api/cron/event-broadcasts
// Dispatches pending/scheduled event update broadcasts.
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

    const body = await req.json().catch(() => ({}));
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? body.limit
        : 20;

    const result = await dispatchScheduledEventBroadcasts(limit);
    return NextResponse.json({
      success: true,
      ...result,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Event broadcast cron error:", error);
    return NextResponse.json(
      { error: "Failed to dispatch scheduled event broadcasts" },
      { status: 500 },
    );
  }
}
