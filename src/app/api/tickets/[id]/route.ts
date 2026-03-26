export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateQrPayload, verifyQrPayload } from '@/lib/qr';
import { getClient } from '@/lib/db';
import { CONTAINERS, resolveMediaFields } from '@/lib/blob';

/**
 * GET /api/tickets/[id]
 *
 * Get detailed ticket info including QR data.
 * Auto-generates QR if it doesn't exist yet (for approved tickets).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Detect schema drift: older deployments may not have tickets.ticket_number.
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

    // First try to find as a paid ticket.
    let result: { rows: any[] } = { rows: [] };
    try {
      result = await query(
        `SELECT
          t.id,
          ${ticketNumberExpr} AS ticket_number,
          CASE
            WHEN t.status = 'PENDING' AND pp.status = 'REJECTED' THEN 'NEEDS_REUPLOAD'
            WHEN t.status = 'PENDING' AND pp.proof_url IS NULL THEN 'PENDING_VERIFICATION'
            ELSE t.status::TEXT
          END AS status,
          t.status AS ticket_status,
          t.purchased_at,
          COALESCE(e.ticket_price, 0) AS amount,
          COALESCE(t.payment_reference::TEXT, '') AS payment_reference,
          e.id AS event_id,
          e.title AS event_title,
          e.location AS event_venue,
          e.event_start,
          e.event_end,
          e.banner_url AS event_banner,
          e.is_paid,
          e.is_cancelled,
          s.name AS society_name,
          s.id AS society_id,
          s.logo_url AS society_logo,
          t.user_id AS owner_user_id,
          u.full_name AS attendee_name,
          u.email AS attendee_email,
          qr.qr_data,
          qr.scanned_at,
          pp.proof_url AS payment_proof_url,
          pp.status AS payment_proof_status,
          ${hasProofMetaCols ? 'pp.transaction_reference' : `''::TEXT`} AS transaction_reference,
          ${hasProofMetaCols ? 'pp.student_note' : 'NULL::TEXT'} AS student_note,
          pp.rejection_reason,
          pp.created_at AS proof_submitted_at,
          'ticket' AS source_type
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        JOIN societies s ON e.society_id = s.id
        JOIN users u ON t.user_id = u.id
        LEFT JOIN ticket_qr_codes qr ON qr.ticket_id = t.id AND qr.is_active = TRUE
        LEFT JOIN LATERAL (
          SELECT
            proof_url,
            status,
            rejection_reason,
            created_at,
            updated_at,
            ${hasProofMetaCols ? 'transaction_reference' : `''::TEXT AS transaction_reference`},
            ${hasProofMetaCols ? 'student_note' : 'NULL::TEXT AS student_note'}
          FROM payment_proofs
          WHERE ticket_id = t.id
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        ) pp ON TRUE
        WHERE t.id = $1 AND t.user_id = $2`,
        [id, user.userId]
      );
    } catch (ticketErr) {
      console.error('Paid ticket detail query failed, falling back to registration query:', ticketErr);
    }

    let ticket = result.rows[0];
    let sourceType: 'ticket' | 'registration' = 'ticket';

    // If not found as paid ticket, try as free registration
    if (!ticket) {
      try {
        result = await query(
          `SELECT
            er.id,
            'FREE-' || SUBSTRING(er.id::text, 1, 8) AS ticket_number,
            'APPROVED' AS status,
            'APPROVED' AS ticket_status,
            er.registered_at AS purchased_at,
            0::NUMERIC AS amount,
            ''::TEXT AS payment_reference,
            e.id AS event_id,
            e.title AS event_title,
            e.location AS event_venue,
            e.event_start,
            e.event_end,
            e.banner_url AS event_banner,
            e.is_paid,
            e.is_cancelled,
            s.name AS society_name,
            s.id AS society_id,
            s.logo_url AS society_logo,
            er.user_id AS owner_user_id,
            u.full_name AS attendee_name,
            u.email AS attendee_email,
            qr.qr_data,
            NULL AS scanned_at,
            NULL::TEXT AS payment_proof_url,
            NULL::TEXT AS payment_proof_status,
            ''::TEXT AS transaction_reference,
            NULL::TEXT AS student_note,
            NULL::TEXT AS rejection_reason,
            NULL::TIMESTAMPTZ AS proof_submitted_at,
            'registration' AS source_type
          FROM event_registrations er
          JOIN events e ON er.event_id = e.id
          JOIN societies s ON e.society_id = s.id
          JOIN users u ON er.user_id = u.id
          LEFT JOIN ticket_qr_codes qr ON qr.registration_id = er.id AND qr.is_active = TRUE
          WHERE er.id = $1 AND er.user_id = $2 AND er.cancelled_at IS NULL`,
          [id, user.userId]
        );
        ticket = result.rows[0];
        sourceType = 'registration';
      } catch (regErr) {
        console.error('Error fetching registration:', regErr);
      }
    }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const expectedType = sourceType === 'ticket' ? 'T' : 'R';
    const shouldHaveQr = ticket.ticket_status === 'APPROVED' && !ticket.is_cancelled;
    const parsedQr = ticket.qr_data ? verifyQrPayload(ticket.qr_data) : null;
    const isQrValid = !!parsedQr
      && parsedQr.type === expectedType
      && parsedQr.id === ticket.id
      && parsedQr.eventId === ticket.event_id
      && parsedQr.userId === ticket.owner_user_id;

    // Ensure one valid signed active QR exists for eligible ticket/registration entries.
    if (shouldHaveQr && !isQrValid) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const qrPayload = generateQrPayload({
          type: expectedType,
          id: ticket.id,
          eventId: ticket.event_id,
          userId: ticket.owner_user_id,
        });

        if (sourceType === 'ticket') {
          await client.query(
            `UPDATE ticket_qr_codes
             SET is_active = FALSE
             WHERE ticket_id = $1 AND is_active = TRUE`,
            [ticket.id]
          );

          await client.query(
            `INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active)
             VALUES ($1, $2, TRUE)`,
            [ticket.id, qrPayload]
          );
        } else {
          await client.query(
            `UPDATE ticket_qr_codes
             SET is_active = FALSE
             WHERE registration_id = $1 AND is_active = TRUE`,
            [ticket.id]
          );

          await client.query(
            `INSERT INTO ticket_qr_codes (registration_id, qr_data, is_active)
             VALUES ($1, $2, TRUE)`,
            [ticket.id, qrPayload]
          );
        }

        await client.query('COMMIT');
        ticket.qr_data = qrPayload;
      } catch (qrErr) {
        await client.query('ROLLBACK');
        console.error('QR auto-generation error:', qrErr);
        // Non-fatal: return ticket details even if QR refresh fails.
      } finally {
        client.release();
      }
    }

    const resolvedTicket = resolveMediaFields(ticket, {
      event_banner: CONTAINERS.EVENT_MEDIA,
      society_logo: CONTAINERS.SOCIETY_MEDIA,
      payment_proof_url: CONTAINERS.EVENT_MEDIA,
    });

    return NextResponse.json({ ticket: resolvedTicket });
  } catch (error) {
    console.error('Ticket detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 });
  }
}
