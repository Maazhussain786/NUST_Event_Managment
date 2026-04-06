export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, resolveMediaFields } from "@/lib/blob";
import { getSocietyPaymentDetails } from "@/lib/payment-wallets";
import { ensureEventCohostsTable } from "@/lib/event-cohosts-schema";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureEventCohostsTable();

    const { id } = await params;
    const user = await getCurrentUser();

    const result = await query(
      `SELECT e.id, e.title, e.description, e.banner_url, e.location, e.venue_details,
              e.event_start, e.event_end, e.ticket_price, e.max_tickets, e.is_paid,
              e.registration_start, e.registration_end, e.category_id, e.is_cancelled,
              e.max_participants, e.participants_count,
              ec.name AS category_name,
              s.id AS society_id,
              CASE
                WHEN creator.user_type = 'SUPER_ADMIN' THEN
                  CONCAT_WS(' | ', s.name, 'NUST Administration', NULLIF(ch.cohost_society_names, ''))
                ELSE
                  CONCAT_WS(
                    ' | ',
                    s.name,
                    CASE WHEN ch.has_nust_admin THEN 'NUST Administration' ELSE NULL END,
                    NULLIF(ch.cohost_society_names, '')
                  )
              END AS society_name,
              s.logo_url AS society_logo,
              COALESCE(tc.tickets_sold, 0) AS tickets_sold,
              COALESCE(tc.tickets_reserved, 0) AS tickets_reserved,
              COALESCE(rt.avg_rating, 0)::numeric(3,2) AS avg_rating,
              COALESCE(rt.rating_count, 0) AS rating_count,
              COALESCE(ch.has_nust_admin, FALSE) AS has_nust_administration,
              COALESCE(ch.cohost_society_names, '') AS cohost_society_names
       FROM events e
       LEFT JOIN event_categories ec ON e.category_id = ec.id
       JOIN societies s ON e.society_id = s.id
       LEFT JOIN users creator ON creator.id = e.created_by
       LEFT JOIN LATERAL (
         SELECT
           COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold,
           COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('PENDING', 'APPROVED')) AS tickets_reserved
         FROM tickets t
         WHERE t.event_id = e.id
       ) tc ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(AVG(r.score), 0) AS avg_rating,
           COUNT(DISTINCT r.id) AS rating_count
         FROM ratings r
         WHERE r.target_type = 'EVENT' AND r.target_id = e.id
       ) rt ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           BOOL_OR(eco.cohost_type = 'NUST_ADMIN' AND eco.status = 'ACTIVE') AS has_nust_admin,
           STRING_AGG(DISTINCT sc.name, ' | ') FILTER (
             WHERE eco.cohost_type = 'SOCIETY'
               AND eco.status = 'ACTIVE'
               AND sc.id IS NOT NULL
               AND sc.id != e.society_id
           ) AS cohost_society_names
         FROM event_cohosts eco
         LEFT JOIN societies sc ON sc.id = eco.society_id
         WHERE eco.event_id = e.id
       ) ch ON TRUE
       WHERE e.id = $1 AND e.deleted_at IS NULL
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = resolveMediaFields(
      result.rows[0],
      {
        banner_url: CONTAINERS.EVENT_MEDIA,
        society_logo: CONTAINERS.SOCIETY_MEDIA,
      },
      24 * 60,
    );

    // Check if current user already has a ticket/registration
    let userRegistrationStatus: {
      hasTicket: boolean;
      status?: string;
      ticketId?: string;
      paymentReference?: string | null;
      paymentProofStatus?: string | null;
      paymentRejectionReason?: string | null;
      hasProof?: boolean;
      selectedWalletId?: string | null;
    } = { hasTicket: false };
    const paymentDetails = event.is_paid
      ? await getSocietyPaymentDetails(
          (text, params) => query(text, params),
          event.society_id,
        )
      : null;

    const ticketSelectedWalletColumn = event.is_paid
      ? await query(
          `SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'tickets'
             AND column_name = 'selected_wallet_id'
           LIMIT 1`,
        )
      : { rows: [] };
    const hasSelectedWalletColumn = ticketSelectedWalletColumn.rows.length > 0;

    if (user) {
      if (event.is_paid) {
        // Check for existing ticket
        const ticketCheck = await query(
          `SELECT
             t.id,
             t.status,
             t.payment_reference,
             ${hasSelectedWalletColumn ? "t.selected_wallet_id," : "NULL::uuid AS selected_wallet_id,"}
             pp.status AS payment_proof_status,
             pp.rejection_reason,
             CASE WHEN pp.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_proof
           FROM tickets t
           LEFT JOIN LATERAL (
             SELECT id, status, rejection_reason
             FROM payment_proofs
             WHERE ticket_id = t.id
             ORDER BY updated_at DESC, created_at DESC
             LIMIT 1
           ) pp ON TRUE
           WHERE t.event_id = $1 AND t.user_id = $2 AND t.status != 'CANCELLED'`,
          [id, user.userId],
        );
        if (ticketCheck.rows.length > 0) {
          const row = ticketCheck.rows[0];
          const derivedStatus =
            row.status === 'PENDING' && !row.has_proof
              ? 'PENDING_VERIFICATION'
              : row.status === 'PENDING' && row.payment_proof_status === 'REJECTED'
                ? 'NEEDS_REUPLOAD'
                : row.status;

          userRegistrationStatus = {
            hasTicket: true,
            status: derivedStatus,
            ticketId: row.id,
            paymentReference: row.payment_reference ?? null,
            paymentProofStatus: row.payment_proof_status ?? null,
            paymentRejectionReason: row.rejection_reason ?? null,
            hasProof: !!row.has_proof,
            selectedWalletId: row.selected_wallet_id ?? null,
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
      paymentDetails,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
