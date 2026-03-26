export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  deactivatePushToken,
  listActivePushTokensForUser,
  upsertPushToken,
} from "@/lib/push-notifications";

function validateToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  if (!token) return null;
  if (token.length < 20 || token.length > 2048) return null;
  return token;
}

// GET /api/push/tokens - list current user's active push tokens.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tokens = await listActivePushTokensForUser(user.userId);
    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("List push tokens error:", error);
    return NextResponse.json(
      { error: "Failed to fetch push tokens" },
      { status: 500 },
    );
  }
}

// POST /api/push/tokens - register or refresh a mobile push token.
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const token = validateToken(body?.token);
    if (!token) {
      return NextResponse.json(
        { error: "Valid push token is required" },
        { status: 400 },
      );
    }

    await upsertPushToken(user.userId, {
      token,
      platform: body?.platform || "unknown",
      deviceId: body?.deviceId || null,
      appVersion: body?.appVersion || null,
      locale: body?.locale || null,
      timezone: body?.timezone || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register push token error:", error);
    return NextResponse.json(
      { error: "Failed to register push token" },
      { status: 500 },
    );
  }
}

// DELETE /api/push/tokens - unregister a mobile push token.
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const token = validateToken(body?.token);
    if (!token) {
      return NextResponse.json(
        { error: "Valid push token is required" },
        { status: 400 },
      );
    }

    await deactivatePushToken(user.userId, token);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unregister push token error:", error);
    return NextResponse.json(
      { error: "Failed to unregister push token" },
      { status: 500 },
    );
  }
}
