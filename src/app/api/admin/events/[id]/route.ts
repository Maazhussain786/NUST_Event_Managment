export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

async function ensurePlatformEventControlsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS platform_event_controls (
      event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// PATCH /api/admin/events/[id] — approve/reject
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
    const body = await req.json();
    const { action, reason } = body;

    await ensurePlatformEventControlsTable();

    if (action === "PINNED" || action === "UNPINNED") {
      const shouldPin = action === "PINNED";
      await query(
        `INSERT INTO platform_event_controls (event_id, is_pinned, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (event_id)
         DO UPDATE SET is_pinned = EXCLUDED.is_pinned, updated_at = NOW()`,
        [id, shouldPin, user.userId],
      );

      await query(
        `INSERT INTO audit_logs (performed_by, action, target_type, target_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user.userId,
          "SUPERADMIN_OVERRIDE",
          "EVENT",
          id,
          JSON.stringify({
            reason: reason || "",
            pinAction: shouldPin ? "PINNED" : "UNPINNED",
          }),
        ],
      );

      return NextResponse.json({ success: true, is_pinned: shouldPin });
    }

    if (
      body.title !== undefined ||
      body.description !== undefined ||
      body.event_start !== undefined ||
      body.event_end !== undefined ||
      body.registration_deadline !== undefined ||
      body.location !== undefined ||
      body.ticket_price !== undefined ||
      body.max_tickets !== undefined ||
      body.banner_url !== undefined
    ) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 0;

      if (body.title !== undefined) {
        idx++;
        sets.push(`title = $${idx}`);
        vals.push(String(body.title).trim());
      }
      if (body.description !== undefined) {
        idx++;
        sets.push(`description = $${idx}`);
        vals.push(body.description ? String(body.description).trim() : null);
      }
      if (body.event_start !== undefined) {
        idx++;
        sets.push(`event_start = $${idx}`);
        vals.push(body.event_start);
      }
      if (body.event_end !== undefined) {
        idx++;
        sets.push(`event_end = $${idx}`);
        vals.push(body.event_end);
      }
      if (body.registration_deadline !== undefined) {
        idx++;
        sets.push(`registration_end = $${idx}`);
        vals.push(
          body.registration_deadline === "" || body.registration_deadline === null
            ? null
            : body.registration_deadline,
        );
      }
      if (body.location !== undefined) {
        idx++;
        sets.push(`location = $${idx}`);
        vals.push(body.location ? String(body.location).trim() : null);
      }
      if (body.ticket_price !== undefined) {
        idx++;
        sets.push(`ticket_price = $${idx}`);
        vals.push(Number(body.ticket_price || 0));
        idx++;
        sets.push(`is_paid = $${idx}`);
        vals.push(Number(body.ticket_price || 0) > 0);
      }
      if (body.max_tickets !== undefined) {
        idx++;
        sets.push(`max_tickets = $${idx}`);
        vals.push(
          body.max_tickets === "" ||
            body.max_tickets === null ||
            Number(body.max_tickets) <= 0
            ? null
            : Number(body.max_tickets),
        );
      }
      if (body.banner_url !== undefined) {
        idx++;
        sets.push(`banner_url = $${idx}`);
        vals.push(body.banner_url || null);
      }

      sets.push("updated_at = NOW()");
      idx++;
      vals.push(id);

      await query(
        `UPDATE events SET ${sets.join(", ")} WHERE id = $${idx}`,
        vals,
      );

      await query(
        `INSERT INTO audit_logs (performed_by, action, target_type, target_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user.userId,
          "EVENT_UPDATED",
          "EVENT",
          id,
          JSON.stringify({ source: "SUPER_ADMIN_PLATFORM_EVENTS_EDIT" }),
        ],
      );

      return NextResponse.json({ success: true });
    }

    if (!["APPROVED", "REJECTED", "CANCELLED"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await query(
      `UPDATE events SET status = $1, is_cancelled = $3, updated_at = NOW() WHERE id = $2`,
      [action, id, action === "CANCELLED"],
    );

    // Log the action
    await query(
      `INSERT INTO audit_logs (performed_by, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        `EVENT_${action}`,
        "EVENT",
        id,
        JSON.stringify({ reason: reason || "" }),
      ],
    );

    return NextResponse.json({ success: true, status: action });
  } catch (error) {
    console.error("Admin event action error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// DELETE /api/admin/events/[id] — soft-delete event
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

    const existing = await query(
      `SELECT id, deleted_at
       FROM events
       WHERE id = $1
       LIMIT 1`,
      [id],
    );

    if (!existing.rows.length) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (existing.rows[0].deleted_at) {
      return NextResponse.json({ success: true });
    }

    await query(
      `UPDATE events
       SET status = 'CANCELLED',
           is_cancelled = TRUE,
           deleted_at = NOW(),
           deleted_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, user.userId],
    );

    await query(
      `INSERT INTO audit_logs (performed_by, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        "EVENT_DELETED",
        "EVENT",
        id,
        JSON.stringify({
          source: "SUPER_ADMIN_PLATFORM_EVENTS",
          deletedBy: user.email,
        }),
      ],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin event delete error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
