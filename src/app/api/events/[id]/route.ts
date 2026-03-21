export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, extractBlobName, generateReadUrl } from "@/lib/blob";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const result = await query(
      `SELECT e.id, e.title, e.description, e.banner_url, e.location, e.venue_details,
              e.event_start, e.event_end, e.ticket_price, e.max_tickets, e.is_paid,
              e.registration_start, e.registration_end, e.category_id, e.is_cancelled,
              e.max_participants, e.participants_count,
              ec.name AS category_name,
              s.id AS society_id, s.name AS society_name, s.logo_url AS society_logo,
              -- For paid events: count approved tickets
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold,
              -- For paid events: count pending + approved (reserved capacity)
              COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('PENDING', 'APPROVED')) AS tickets_reserved,
              COALESCE(AVG(r.score), 0)::numeric(3,2) AS avg_rating,
              COUNT(DISTINCT r.id) AS rating_count
       FROM events e
       LEFT JOIN event_categories ec ON e.category_id = ec.id
       JOIN societies s ON e.society_id = s.id
       LEFT JOIN tickets t ON e.id = t.event_id
       LEFT JOIN ratings r ON r.target_type = 'EVENT' AND r.target_id = e.id
       WHERE e.id = $1 AND e.deleted_at IS NULL
       GROUP BY e.id, ec.name, s.id`,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const rawEvent = result.rows[0];
    const bannerBlob = rawEvent.banner_url
      ? extractBlobName(rawEvent.banner_url, CONTAINERS.EVENT_MEDIA)
      : null;
    const logoBlob = rawEvent.society_logo
      ? extractBlobName(rawEvent.society_logo, CONTAINERS.SOCIETY_MEDIA)
      : null;

    const event = {
      ...rawEvent,
      banner_url: bannerBlob
        ? generateReadUrl(CONTAINERS.EVENT_MEDIA, bannerBlob, 24 * 60)
        : rawEvent.banner_url,
      society_logo: logoBlob
        ? generateReadUrl(CONTAINERS.SOCIETY_MEDIA, logoBlob, 24 * 60)
        : rawEvent.society_logo,
    };

    // Check if current user already has a ticket/registration
    let userRegistrationStatus: {
      hasTicket: boolean;
      status?: string;
      ticketId?: string;
    } = { hasTicket: false };

    if (user) {
      if (event.is_paid) {
        // Check for existing ticket
        const ticketCheck = await query(
          `SELECT id, status FROM tickets WHERE event_id = $1 AND user_id = $2 AND status != 'CANCELLED'`,
          [id, user.userId],
        );
        if (ticketCheck.rows.length > 0) {
          userRegistrationStatus = {
            hasTicket: true,
            status: ticketCheck.rows[0].status,
            ticketId: ticketCheck.rows[0].id,
          };
        }
      } else {
        // Check for existing registration (free event)
        const regCheck = await query(
          `SELECT id FROM event_registrations WHERE event_id = $1 AND user_id = $2 AND cancelled_at IS NULL`,
          [id, user.userId],
        );
        if (regCheck.rows.length > 0) {
          userRegistrationStatus = {
            hasTicket: true,
            status: "APPROVED",
            ticketId: regCheck.rows[0].id,
          };
        }
      }
    }

    return NextResponse.json({
      event,
      userRegistration: userRegistrationStatus,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
