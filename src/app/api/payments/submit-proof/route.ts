export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { uploadBlob, CONTAINERS, resolveMediaUrl } from '@/lib/blob';
import {
  validateImageFile,
  validateMagicBytes,
  processImage,
  generateBlobPath,
} from '@/lib/upload';

export async function POST(req: NextRequest) {
  const client = await getClient();
  let uploadedBlobName: string | null = null;

  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('proof') as File | null;
    const ticketId = String(formData.get('ticket_id') || '');
    const paymentReference = String(formData.get('payment_reference') || '').trim();
    const eventId = String(formData.get('event_id') || '').trim();
    const transactionReference = String(formData.get('transaction_reference') || '').trim();
    const note = String(formData.get('note') || '').trim();
    const walletId = String(formData.get('wallet_id') || '').trim();
    const walletIdCandidate = /^[0-9a-fA-F-]{36}$/.test(walletId) ? walletId : '';

    if (!ticketId && !paymentReference) {
      return NextResponse.json({ error: 'payment_reference or ticket_id is required' }, { status: 400 });
    }

    if (!transactionReference) {
      return NextResponse.json({ error: 'transaction_reference is required' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'proof image is required' }, { status: 400 });
    }

    const validation = validateImageFile(file.name, file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json({ error: 'File content does not match declared type' }, { status: 400 });
    }

    const processed = await processImage(buffer, file.type);

    await client.query('BEGIN');

    let ticketResult = { rows: [] as any[] };

    if (paymentReference) {
      ticketResult = await client.query(
        `SELECT
           t.id,
           t.user_id,
           t.status,
           t.payment_reference,
           t.event_id,
           e.title AS event_title,
           e.is_paid,
           e.is_cancelled,
           e.status AS event_status,
           e.event_end,
           e.society_id,
           s.name AS society_name
         FROM tickets t
         JOIN events e ON e.id = t.event_id
         JOIN societies s ON s.id = e.society_id
         WHERE t.payment_reference = $1
         FOR UPDATE OF t`,
        [paymentReference]
      );
    }

    if (ticketResult.rows.length === 0 && ticketId) {
      ticketResult = await client.query(
      `SELECT
         t.id,
         t.user_id,
         t.status,
         t.payment_reference,
         t.event_id,
         e.title AS event_title,
         e.is_paid,
         e.is_cancelled,
         e.status AS event_status,
         e.event_end,
         e.society_id,
         s.name AS society_name
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       JOIN societies s ON s.id = e.society_id
       WHERE t.id = $1
       FOR UPDATE OF t`,
      [ticketId]
    );
    }

    // If identifiers are stale/missing, recover by resolving the latest buyer ticket for this event.
    if (ticketResult.rows.length === 0 && eventId) {
      ticketResult = await client.query(
        `SELECT
           t.id,
           t.user_id,
           t.status,
           t.payment_reference,
           t.event_id,
           e.title AS event_title,
           e.is_paid,
           e.is_cancelled,
           e.status AS event_status,
           e.event_end,
           e.society_id,
           s.name AS society_name
         FROM tickets t
         JOIN events e ON e.id = t.event_id
         JOIN societies s ON s.id = e.society_id
         WHERE t.event_id = $1 AND t.user_id = $2
           AND t.status IN ('PENDING', 'REJECTED')
         ORDER BY t.updated_at DESC, t.purchased_at DESC
         LIMIT 1
         FOR UPDATE OF t`,
        [eventId, user.userId]
      );
    }

    // As a final source-of-truth fallback, ensure a buyer ticket exists for this event/user.
    if (ticketResult.rows.length === 0 && eventId) {
      const eventCheck = await client.query(
        `SELECT id, is_paid, is_cancelled, status, event_end
         FROM events
         WHERE id = $1
         FOR UPDATE`,
        [eventId]
      );

      if (eventCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      const eventRow = eventCheck.rows[0];
      if (!eventRow.is_paid) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Payment proof is only valid for paid events' }, { status: 400 });
      }
      if (eventRow.is_cancelled || eventRow.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Event is cancelled' }, { status: 409 });
      }
      if (eventRow.status === 'COMPLETED' || eventRow.status === 'ARCHIVED') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Event has ended' }, { status: 409 });
      }
      if (eventRow.event_end && new Date(eventRow.event_end) < new Date()) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Event has ended' }, { status: 409 });
      }

      const ensuredTicket = await client.query(
        `INSERT INTO tickets (event_id, user_id, status, payment_reference)
         VALUES ($1, $2, 'PENDING', uuid_generate_v4())
         ON CONFLICT (event_id, user_id) DO UPDATE
         SET status = CASE
               WHEN tickets.status IN ('REJECTED', 'CANCELLED') THEN 'PENDING'
               ELSE tickets.status
             END,
             payment_reference = CASE
               WHEN tickets.status IN ('REJECTED', 'CANCELLED') THEN uuid_generate_v4()
               ELSE tickets.payment_reference
             END,
             purchased_at = CASE
               WHEN tickets.status IN ('REJECTED', 'CANCELLED') THEN NOW()
               ELSE tickets.purchased_at
             END,
             cancelled_at = CASE
               WHEN tickets.status IN ('REJECTED', 'CANCELLED') THEN NULL
               ELSE tickets.cancelled_at
             END,
             approved_at = CASE
               WHEN tickets.status IN ('REJECTED', 'CANCELLED') THEN NULL
               ELSE tickets.approved_at
             END,
             approved_by = CASE
               WHEN tickets.status IN ('REJECTED', 'CANCELLED') THEN NULL
               ELSE tickets.approved_by
             END,
             checked_in_at = CASE
               WHEN tickets.status IN ('REJECTED', 'CANCELLED') THEN NULL
               ELSE tickets.checked_in_at
             END,
             updated_at = NOW()
         RETURNING id`,
        [eventId, user.userId]
      );

      ticketResult = await client.query(
        `SELECT
           t.id,
           t.user_id,
           t.status,
           t.payment_reference,
           t.event_id,
           e.title AS event_title,
           e.is_paid,
           e.is_cancelled,
           e.status AS event_status,
           e.event_end,
           e.society_id,
           s.name AS society_name
         FROM tickets t
         JOIN events e ON e.id = t.event_id
         JOIN societies s ON s.id = e.society_id
         WHERE t.id = $1
         FOR UPDATE OF t`,
        [ensuredTicket.rows[0].id]
      );
    }

    if (ticketResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ticket = ticketResult.rows[0];
    const resolvedTicketId = ticket.id as string;

    const walletColumn = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'tickets'
         AND column_name = 'selected_wallet_id'
       LIMIT 1`
    );
    const hasSelectedWalletColumn = walletColumn.rows.length > 0;

    if (ticket.user_id !== user.userId && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'You can only submit proof for your own ticket' }, { status: 403 });
    }

    if (!ticket.is_paid) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Payment proof is only valid for paid events' }, { status: 400 });
    }

    if (ticket.is_cancelled || ticket.event_status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event is cancelled' }, { status: 409 });
    }

    if (ticket.event_end && new Date(ticket.event_end) < new Date()) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event has ended' }, { status: 409 });
    }

    if (ticket.status === 'APPROVED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Ticket is already approved' }, { status: 409 });
    }

    if (ticket.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Ticket is cancelled' }, { status: 409 });
    }

    if (walletIdCandidate && hasSelectedWalletColumn) {
      const walletCheck = await client.query(
        `SELECT id
         FROM society_payment_wallets
         WHERE id = $1
           AND society_id = $2
           AND is_enabled = TRUE
         LIMIT 1`,
        [walletIdCandidate, ticket.society_id]
      );
      if (walletCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Selected wallet is invalid for this event' },
          { status: 400 }
        );
      }

      await client.query(
        `UPDATE tickets
         SET selected_wallet_id = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [resolvedTicketId, walletIdCandidate]
      );
    }

    const blobPath = generateBlobPath('payment', ticket.event_id, 'proof', file.name);
    const upload = await uploadBlob(
      CONTAINERS.EVENT_MEDIA,
      blobPath,
      processed.buffer,
      processed.mimeType,
      {
        uploadedBy: user.userId,
        ticketId: resolvedTicketId,
        eventId: ticket.event_id,
        kind: 'payment-proof',
      }
    );
    uploadedBlobName = upload.blobName;

    const proofCols = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'payment_proofs'
         AND column_name IN ('transaction_reference', 'student_note')`
    );
    const hasProofMetaCols = proofCols.rows.length >= 2;

    const existingProof = await client.query(
      `SELECT id
       FROM payment_proofs
       WHERE ticket_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [resolvedTicketId]
    );

    if (existingProof.rows.length > 0) {
      if (hasProofMetaCols) {
        await client.query(
          `UPDATE payment_proofs
           SET uploaded_by = $1,
               proof_url = $2,
               proof_type = $3,
               transaction_reference = $4,
               student_note = $5,
               status = 'PENDING',
               verified_by = NULL,
               verified_at = NULL,
               rejection_reason = NULL,
               updated_at = NOW()
           WHERE id = $6`,
          [
            user.userId,
            upload.url,
            'SCREENSHOT',
            transactionReference,
            note || null,
            existingProof.rows[0].id,
          ]
        );
      } else {
        await client.query(
          `UPDATE payment_proofs
           SET uploaded_by = $1,
               proof_url = $2,
               proof_type = $3,
               status = 'PENDING',
               verified_by = NULL,
               verified_at = NULL,
               rejection_reason = NULL,
               updated_at = NOW()
           WHERE id = $4`,
          [user.userId, upload.url, 'SCREENSHOT', existingProof.rows[0].id]
        );
      }
    } else {
      if (hasProofMetaCols) {
        await client.query(
          `INSERT INTO payment_proofs
             (ticket_id, uploaded_by, proof_url, proof_type, transaction_reference, student_note, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
          [resolvedTicketId, user.userId, upload.url, 'SCREENSHOT', transactionReference, note || null]
        );
      } else {
        await client.query(
          `INSERT INTO payment_proofs
             (ticket_id, uploaded_by, proof_url, proof_type, status)
           VALUES ($1, $2, $3, $4, 'PENDING')`,
          [resolvedTicketId, user.userId, upload.url, 'SCREENSHOT']
        );
      }
    }

    if (ticket.status === 'REJECTED') {
      await client.query(
        `UPDATE tickets
         SET status = 'PENDING',
             approved_at = NULL,
             approved_by = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [resolvedTicketId]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ('PAYMENT_VERIFIED', $1, $2, 'ticket', $3, $4, $5)`,
      [
        user.userId,
        ticket.society_id,
        resolvedTicketId,
        JSON.stringify({ transaction_reference: transactionReference, payment_reference: ticket.payment_reference }),
        JSON.stringify({
          eventTitle: ticket.event_title,
          societyName: ticket.society_name,
          note: note || null,
          message: 'Payment proof submitted by student',
        }),
      ]
    );

    const approvers = await client.query(
      `SELECT DISTINCT sm.user_id
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       JOIN role_privileges rp ON r.id = rp.role_id
       JOIN privileges p ON rp.privilege_id = p.id
       WHERE sm.society_id = $1
         AND sm.is_active = TRUE
         AND p.name = 'VERIFY_PAYMENTS'
         AND sm.user_id != $2`,
      [ticket.society_id, user.userId]
    );

    for (const approver of approvers.rows) {
      await client.query(
        `INSERT INTO notifications (user_id, title, body, link)
         VALUES ($1, $2, $3, $4)`,
        [
          approver.user_id,
          'Payment Proof Submitted',
          `${user.fullName || 'A student'} submitted payment proof for "${ticket.event_title}"`,
          `/society/${ticket.society_id}/approvals`,
        ]
      );
    }

    await client.query(
      `INSERT INTO notifications (user_id, title, body, link)
       VALUES ($1, $2, $3, $4)`,
      [
        user.userId,
        'Proof Submitted',
        `Your payment proof for "${ticket.event_title}" is now pending verification.`,
        `/tickets/${resolvedTicketId}`,
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      ticket: {
        id: resolvedTicketId,
        status: 'PENDING',
      },
      paymentProof: {
        url: resolveMediaUrl(upload.url, {
          container: CONTAINERS.EVENT_MEDIA,
          expiresInMinutes: 24 * 60,
        }),
        transactionReference,
      },
      message: 'Payment proof submitted. Awaiting society approval.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit payment proof error:', error);
    return NextResponse.json({ error: 'Failed to submit payment proof' }, { status: 500 });
  } finally {
    client.release();
  }
}
