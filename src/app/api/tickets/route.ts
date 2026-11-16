export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTAINERS, resolveMediaFields } from '@/lib/blob';
import { ensureEventCohostsTable } from '@/lib/event-cohosts-schema';

let ticketNumberColumnPromise: Promise<boolean> | null = null;
let proofMetaColumnsPromise: Promise<boolean> | null = null;

async function hasTicketNumberColumn(): Promise<boolean> {
  if (!ticketNumberColumnPromise) {
    ticketNumberColumnPromise = query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'tickets'
         AND column_name = 'ticket_number'
       LIMIT 1`
    )
      .then((res) => res.rows.length > 0)
      .catch((err) => {
        ticketNumberColumnPromise = null;
        throw err;
      });
  }

  return ticketNumberColumnPromise;
}

async function hasPaymentProofMetaColumns(): Promise<boolean> {
  if (!proofMetaColumnsPromise) {
    proofMetaColumnsPromise = query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'payment_proofs'
         AND column_name IN ('transaction_reference', 'student_note')`
    )
      .then((res) => res.rows.length >= 2)
      .catch((err) => {
        proofMetaColumnsPromise = null;
        throw err;
      });
  }

  return proofMetaColumnsPromise;
}

/**
 * GET /api/tickets
 *
 * List all tickets for the authenticated user.
 * Includes event details, society info, and QR status.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureEventCohostsTable();

    const ticketNumberExpr = (await hasTicketNumberColumn())
      ? 't.ticket_number'
      : `'TICKET-' || SUBSTRING(t.id::text, 1, 8)`;

    const hasProofMetaCols = await hasPaymentProofMetaColumns();
    const transactionRefExpr = hasProofMetaCols ? 'pp.transaction_reference' : `''::TEXT`;

    const url = new URL(req.url);
    const statusFilter = (url.searchParams.get("status") || "").trim().toUpperCase();
    const upcomingOnly = (url.searchParams.get("upcoming") || "").toLowerCase() === "true";
    const limitRaw = Number(url.searchParams.get("limit") || "0");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 0;

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
          e.thumbnail_url AS event_thumbnail,
          e.is_paid,
          e.is_cancelled,
          CASE
            WHEN creator.user_type = 'SUPER_ADMIN' THEN
              CONCAT_WS(' | ', s.name, 'SEECS Administration', NULLIF(ch.cohost_society_names, ''))
            ELSE
              CONCAT_WS(
                ' | ',
                s.name,
                CASE WHEN ch.has_nust_admin THEN 'SEECS Administration' ELSE NULL END,
                NULLIF(ch.cohost_society_names, '')
              )
          END AS society_name,
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
        LEFT JOIN users creator ON creator.id = e.created_by
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
          e.thumbnail_url AS event_thumbnail,
          e.is_paid,
          e.is_cancelled,
          CASE
            WHEN creator.user_type = 'SUPER_ADMIN' THEN
              CONCAT_WS(' | ', s.name, 'SEECS Administration', NULLIF(ch.cohost_society_names, ''))
            ELSE
              CONCAT_WS(
                ' | ',
                s.name,
                CASE WHEN ch.has_nust_admin THEN 'SEECS Administration' ELSE NULL END,
                NULLIF(ch.cohost_society_names, '')
              )
          END AS society_name,
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
        LEFT JOIN users creator ON creator.id = e.created_by
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
    let allTickets = [...paidTickets, ...freeRegistrations].sort(
      (a, b) => new Date(b.event_start).getTime() - new Date(a.event_start).getTime()
    );

    if (statusFilter) {
      allTickets = allTickets.filter((row) => String(row.status || "").toUpperCase() === statusFilter);
    }

    if (upcomingOnly) {
      const nowMs = Date.now();
      allTickets = allTickets.filter((row) => new Date(row.event_start).getTime() > nowMs);
    }

    if (limit > 0) {
      allTickets = allTickets.slice(0, limit);
    }

    const resolvedTickets = allTickets.map((ticketRow) =>
      resolveMediaFields(ticketRow, {
        event_banner: CONTAINERS.EVENT_MEDIA,
        event_thumbnail: CONTAINERS.EVENT_MEDIA,
        society_logo: CONTAINERS.SOCIETY_MEDIA,
        payment_proof_url: CONTAINERS.EVENT_MEDIA,
      }),
    );

    return NextResponse.json(resolvedTickets);
  } catch (error) {
    console.error('Tickets list error:', error);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}
