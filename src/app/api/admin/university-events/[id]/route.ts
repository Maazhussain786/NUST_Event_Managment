export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/university-events/[id] — update pin/lock/priority/status
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

function extractMetaImage(html: string): string | null {
  const ogImageMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  if (ogImageMatch?.[1]) return ogImageMatch[1];

  const twitterImageMatch = html.match(
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  if (twitterImageMatch?.[1]) return twitterImageMatch[1];

  return null;
}

async function resolveBannerUrl(input: unknown): Promise<string | null> {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return null;
  }

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; NUST-Events/1.0; +https://nust.edu.pk)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return parsed.toString();
    }

    const contentType = (response.headers.get("content-type") || "")
      .toLowerCase()
      .trim();

    if (contentType.startsWith("image/")) {
      return response.url || parsed.toString();
    }

    if (contentType.includes("text/html")) {
      const html = await response.text();
      const metaImage = extractMetaImage(html);
      if (metaImage) {
        try {
          return new URL(metaImage, parsed.toString()).toString();
        } catch {
          return parsed.toString();
        }
      }
    }

    return parsed.toString();
  } catch {
    return parsed.toString();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json();

    // Update university-specific fields
    if (
      body.is_pinned !== undefined ||
      body.is_locked !== undefined ||
      body.priority_rank !== undefined
    ) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 0;

      if (body.is_pinned !== undefined) {
        idx++;
        sets.push(`is_pinned = $${idx}`);
        vals.push(body.is_pinned);
      }
      if (body.is_locked !== undefined) {
        idx++;
        sets.push(`is_locked = $${idx}`);
        vals.push(body.is_locked);
      }
      if (body.priority_rank !== undefined) {
        idx++;
        sets.push(`priority_rank = $${idx}`);
        vals.push(body.priority_rank);
      }

      sets.push("updated_at = NOW()");
      idx++;
      vals.push(id);

      await query(
        `UPDATE platform_university_events SET ${sets.join(", ")} WHERE event_id = $${idx}`,
        vals,
      );
    }

    // Update event status if provided
    if (body.status) {
      const validStatuses = ["APPROVED", "CANCELLED", "PENDING"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      await query(
        "UPDATE events SET status = $1, is_cancelled = $3, updated_at = NOW() WHERE id = $2",
        [body.status, id, body.status === "CANCELLED"],
      );
    }

    // Update core event fields if provided
    if (
      body.title !== undefined ||
      body.description !== undefined ||
      body.event_start !== undefined ||
      body.event_end !== undefined ||
      body.location !== undefined ||
      body.banner_url !== undefined ||
      body.ticket_price !== undefined ||
      body.max_tickets !== undefined
    ) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 0;

      if (body.title !== undefined) {
        idx++;
        sets.push(`title = $${idx}`);
        vals.push(body.title);
      }
      if (body.description !== undefined) {
        idx++;
        sets.push(`description = $${idx}`);
        vals.push(body.description || null);
      }
      if (body.event_start !== undefined) {
        idx++;
        sets.push(`event_start = $${idx}`);
        vals.push(body.event_start);
      }
      if (body.event_end !== undefined) {
        idx++;
        sets.push(`event_end = $${idx}`);
        vals.push(body.event_end || body.event_start || null);
      }
      if (body.location !== undefined) {
        idx++;
        sets.push(`location = $${idx}`);
        vals.push(body.location || null);
      }
      if (body.banner_url !== undefined) {
        const resolvedBannerUrl = await resolveBannerUrl(body.banner_url);
        idx++;
        sets.push(`banner_url = $${idx}`);
        vals.push(resolvedBannerUrl);
      }
      if (body.ticket_price !== undefined) {
        idx++;
        sets.push(`ticket_price = $${idx}`);
        vals.push(
          body.ticket_price === "" ? 0 : Number(body.ticket_price || 0),
        );
      }
      if (body.max_tickets !== undefined) {
        idx++;
        sets.push(`max_tickets = $${idx}`);
        vals.push(
          body.max_tickets === "" || Number(body.max_tickets) <= 0
            ? null
            : Number(body.max_tickets),
        );
      }

      sets.push("updated_at = NOW()");
      idx++;
      vals.push(id);

      await query(
        `UPDATE events SET ${sets.join(", ")} WHERE id = $${idx}`,
        vals,
      );
    }

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'EVENT', $2, $3, $4)`,
      [
        user.userId,
        id,
        JSON.stringify(body),
        JSON.stringify({
          updatedBy: user.email,
          type: "UNIVERSITY_EVENT_UPDATE",
        }),
      ],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update university event error:", error);
    return NextResponse.json(
      { error: "Failed to update university event" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = params;

    // Remove from university list and mark event cancelled (safe soft-delete behavior).
    await query("DELETE FROM platform_university_events WHERE event_id = $1", [
      id,
    ]);
    await query(
      "UPDATE events SET status = $1, is_cancelled = TRUE, updated_at = NOW() WHERE id = $2",
      ["CANCELLED", id],
    );

    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'EVENT', $2, $3)`,
      [
        user.userId,
        id,
        JSON.stringify({
          type: "UNIVERSITY_EVENT_DELETE",
          deletedBy: user.email,
        }),
      ],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete university event error:", error);
    return NextResponse.json(
      { error: "Failed to delete university event" },
      { status: 500 },
    );
  }
}
