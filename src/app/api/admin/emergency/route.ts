export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/emergency — current emergency status + flags
 * POST /api/admin/emergency — toggle an emergency control flag
 *
 * Emergency controls are a subset of feature flags with critical severity.
 * They provide quick-access toggles for platform-wide shutdowns.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const EMERGENCY_FLAGS = [
  {
    key: "emergency_disable_registrations",
    label: "Disable All Registrations",
    description:
      "Immediately prevent all new event registrations platform-wide",
    severity: "CRITICAL" as const,
  },
  {
    key: "emergency_disable_payments",
    label: "Disable All Payments",
    description: "Freeze all payment processing and ticket purchases",
    severity: "CRITICAL" as const,
  },
  {
    key: "emergency_disable_qr",
    label: "Disable QR Check-in",
    description: "Disable all QR code scanning for attendance",
    severity: "HIGH" as const,
  },
  {
    key: "emergency_freeze_events",
    label: "Freeze Event Creation",
    description: "Prevent societies from creating or editing events",
    severity: "HIGH" as const,
  },
  {
    key: "emergency_maintenance_mode",
    label: "Maintenance Mode",
    description: "Put the entire platform in maintenance mode for all users",
    severity: "CRITICAL" as const,
  },
  {
    key: "emergency_disable_uploads",
    label: "Disable All Uploads",
    description: "Block all file/media uploads across the platform",
    severity: "MEDIUM" as const,
  },
];

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_emergency_flags (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT false,
        severity TEXT NOT NULL DEFAULT 'HIGH',
        toggled_by UUID REFERENCES users(id),
        toggled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const count = await query(
      "SELECT COUNT(*) AS c FROM platform_emergency_flags",
    );
    if (parseInt(count.rows[0].c) === 0) {
      for (const flag of EMERGENCY_FLAGS) {
        await query(
          `INSERT INTO platform_emergency_flags (key, label, description, enabled, severity)
           VALUES ($1, $2, $3, false, $4)
           ON CONFLICT (key) DO NOTHING`,
          [flag.key, flag.label, flag.description, flag.severity],
        );
      }
    }
  } catch {
    return false;
  }
  return true;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tableReady = await ensureTable();

    let flags;
    if (tableReady) {
      const result = await query(
        "SELECT key, label, description, enabled, severity FROM platform_emergency_flags ORDER BY severity DESC, key",
      );
      flags = result.rows;
    } else {
      flags = EMERGENCY_FLAGS.map((f) => ({ ...f, enabled: false }));
    }

    // Count active incidents
    let activeIncidents = 0;
    try {
      const inc = await query(
        `SELECT COUNT(*) AS c FROM platform_incidents WHERE status IN ('OPEN', 'INVESTIGATING')`,
      );
      activeIncidents = parseInt(inc.rows[0].c);
    } catch {
      // table might not exist yet
    }

    // Last emergency action
    let lastEmergencyAction = null;
    try {
      const last = await query(
        `SELECT created_at FROM audit_logs
         WHERE target_type = 'EMERGENCY_FLAG'
         ORDER BY created_at DESC LIMIT 1`,
      );
      lastEmergencyAction = last.rows[0]?.created_at || null;
    } catch {
      // ignore
    }

    return NextResponse.json({
      flags,
      activeIncidents,
      lastEmergencyAction,
    });
  } catch (error) {
    console.error("Emergency status error:", error);
    return NextResponse.json(
      { error: "Failed to fetch emergency status" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tableReady = await ensureTable();
    if (!tableReady) {
      return NextResponse.json(
        { error: "Emergency flags store is unavailable" },
        { status: 500 },
      );
    }

    const { key, enabled } = await req.json();
    if (!key || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "key and enabled (boolean) required" },
        { status: 400 },
      );
    }

    await query(
      `UPDATE platform_emergency_flags
       SET enabled = $1, toggled_by = $2, toggled_at = NOW()
       WHERE key = $3`,
      [enabled, user.userId, key],
    );

    // Audit with high visibility
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'EMERGENCY_FLAG', $2, $3, $4)`,
      [
        user.userId,
        null,
        JSON.stringify({ enabled }),
        JSON.stringify({
          emergencyFlag: key,
          toggledBy: user.email,
          action: enabled ? "ACTIVATED" : "DEACTIVATED",
        }),
      ],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Emergency toggle error:", error);
    return NextResponse.json(
      { error: "Failed to toggle emergency flag" },
      { status: 500 },
    );
  }
}
