export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/tickets
 *
 * List all tickets for the authenticated user.
 * Includes event details, society info, and QR status.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ticketNumberColumn = await query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'tickets'
         AND column_name = 'ticket_number'
       LIMIT 1`
    );

    const ticketNumberExpr = ticketNumberColumn.rows.length > 0
      ? 't.ticket_number'
      : `'TICKET-' || SUBSTRING(t.id::text, 1, 8)`;

    const proofMetaCols = await query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'payment_proofs'
         AND column_name IN ('transaction_reference', 'student_note')`
    );
    const hasProofMetaCols = proofMetaCols.rows.length >= 2;
    const transactionRefExpr = hasProofMetaCols ? 'pp.transaction_reference' : `''::TEXT`;

    // First, fetch paid event tickets.
    let paidTickets = [];
    try {
      const ticketsResult = await query(
        `SELECT
          t.id,
          ${ticketNumberExpr} AS ticket_number,
          CASE
            WHEN t.status = 'PENDING' AND pp.status = 'REJECTED' THEN 'NEEDS_REUPLOAD'
            WHEN t.status = 'PENDING' AND pp.proof_url IS NULL THEN 'PENDING_VERIFICATION'
            ELSE t.status::TEXT
          END AS status,
          t.purchased_at,
          e.id AS event_id,
          e.title AS event_title,
          e.location AS event_venue,
          e.event_start,
          e.event_end,
          e.banner_url AS event_banner,
          e.is_paid,
          e.is_cancelled,
          s.name AS society_name,
          s.logo_url AS society_logo,
          CASE WHEN qr.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_qr,
          pp.proof_url AS payment_proof_url,
          pp.status AS payment_proof_status,
          ${transactionRefExpr} AS transaction_reference,
          pp.rejection_reason,
          'ticket' AS source_type
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        JOIN societies s ON e.society_id = s.id
        LEFT JOIN ticket_qr_codes qr ON qr.ticket_id = t.id AND qr.is_active = TRUE
        LEFT JOIN LATERAL (
          SELECT
            proof_url,
            status,
            rejection_reason,
            ${hasProofMetaCols ? 'transaction_reference' : `''::TEXT AS transaction_reference`}
          FROM payment_proofs
          WHERE ticket_id = t.id
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        ) pp ON TRUE
        WHERE t.user_id = $1
          AND t.status != 'CANCELLED'`,
        [user.userId]
      );
      paidTickets = ticketsResult.rows;
    } catch (ticketErr) {
      console.error('Error fetching paid tickets:', ticketErr);
    }

    // Then, fetch free event registrations and their QR status.
    let freeRegistrations = [];
    try {
      const regResult = await query(
        `SELECT
          er.id,
          'FREE-' || SUBSTRING(er.id::text, 1, 8) AS ticket_number,
          'APPROVED' AS status,
          er.registered_at AS purchased_at,
          e.id AS event_id,
          e.title AS event_title,
          e.location AS event_venue,
          e.event_start,
          e.event_end,
          e.banner_url AS event_banner,
          e.is_paid,
          e.is_cancelled,
          s.name AS society_name,
          s.logo_url AS society_logo,
          CASE WHEN qr.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_qr,
          NULL::TEXT AS payment_proof_url,
          NULL::TEXT AS payment_proof_status,
          ''::TEXT AS transaction_reference,
          NULL::TEXT AS rejection_reason,
          'registration' AS source_type
        FROM event_registrations er
        JOIN events e ON er.event_id = e.id
        JOIN societies s ON e.society_id = s.id
        LEFT JOIN ticket_qr_codes qr ON qr.registration_id = er.id AND qr.is_active = TRUE
        WHERE er.user_id = $1
          AND er.cancelled_at IS NULL`,
        [user.userId]
      );
      freeRegistrations = regResult.rows;
    } catch (regErr) {
      console.error('Error fetching registrations:', regErr);
    }

    // Combine and sort by event_start descending
    const allTickets = [...paidTickets, ...freeRegistrations].sort(
      (a, b) => new Date(b.event_start).getTime() - new Date(a.event_start).getTime()
    );

    return NextResponse.json(allTickets);
  } catch (error) {
    console.error('Tickets list error:', error);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}
