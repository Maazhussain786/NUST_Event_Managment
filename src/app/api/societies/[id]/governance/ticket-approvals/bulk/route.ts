export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateQrPayload } from '@/lib/qr';

// POST /api/societies/[id]/governance/ticket-approvals/bulk — bulk approve/reject tickets
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;
    const body = await req.json();
    const { ticketIds, action, reason } = body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return NextResponse.json({ error: 'ticketIds must be a non-empty array' }, { status: 400 });
    }
    if (!['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Verify privilege
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'VERIFY_PAYMENTS') AS allowed`,
      [user.userId, societyId]
    );
    if (!privCheck.rows[0].allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let processed = 0;
    let failed = 0;
    let skippedSelf = 0;

    for (const ticketId of ticketIds) {
      try {
        // Get ticket and lock row
        const ticketResult = await client.query(
          `SELECT t.id, t.status, t.user_id, e.title AS event_title, e.id AS event_id
           FROM tickets t
           JOIN events e ON t.event_id = e.id
           WHERE t.id = $1 AND e.society_id = $2 AND t.status = 'PENDING'
           FOR UPDATE`,
          [ticketId, societyId]
        );

        if (ticketResult.rows.length === 0) {
          failed++;
          continue;
        }

        const ticket = ticketResult.rows[0];

        // ── Self-approval protection ──────────────────────────────────
        if (action === 'APPROVE' && ticket.user_id === user.userId) {
          skippedSelf++;
          continue;
        }

        if (action === 'APPROVE') {
          await client.query(
            `UPDATE tickets SET status = 'APPROVED', approved_at = NOW(), approved_by = $1, updated_at = NOW()
             WHERE id = $2`,
            [user.userId, ticketId]
          );

          await client.query(
            `UPDATE payment_proofs
             SET status = 'VERIFIED', verified_by = $1, verified_at = NOW(), rejection_reason = NULL, updated_at = NOW()
             WHERE id = (
               SELECT id FROM payment_proofs WHERE ticket_id = $2 ORDER BY updated_at DESC, created_at DESC LIMIT 1
             )`,
            [user.userId, ticketId]
          );

          // ── Generate QR code for approved ticket ──────────────────
          const qrPayload = generateQrPayload({
            type: 'T',
            id: ticketId,
            eventId: ticket.event_id,
            userId: ticket.user_id,
          });

          await client.query(
            `UPDATE ticket_qr_codes SET is_active = FALSE WHERE ticket_id = $1 AND is_active = TRUE`,
            [ticketId]
          );

          await client.query(
            `INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active)
             VALUES ($1, $2, TRUE)`,
            [ticketId, qrPayload]
          );
        } else {
          await client.query(
            `UPDATE tickets SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`,
            [ticketId]
          );
          await client.query(
            `UPDATE payment_proofs
             SET status = 'REJECTED', rejection_reason = $1, verified_by = $2, verified_at = NOW(), updated_at = NOW()
             WHERE id = (
               SELECT id FROM payment_proofs WHERE ticket_id = $3 ORDER BY updated_at DESC, created_at DESC LIMIT 1
             )`,
            [reason || 'Payment proof rejected', user.userId, ticketId]
          );
        }

        // Notification to buyer
        await client.query(
          `INSERT INTO notifications (user_id, title, body, link)
           VALUES ($1, $2, $3, $4)`,
          [
            ticket.user_id,
            action === 'APPROVE' ? 'Ticket Approved 🎉' : 'Ticket Rejected',
            action === 'APPROVE'
              ? `Your ticket for "${ticket.event_title}" has been approved! Your QR code is ready.`
              : `Your ticket for "${ticket.event_title}" was rejected. ${reason || ''}`,
            action === 'APPROVE' ? `/tickets` : `/events/${ticket.event_id}`,
          ]
        );

        processed++;
      } catch {
        failed++;
      }
    }

    // Single bulk audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ($1, $2, $3, 'ticket', $4, $5, $6)`,
      [
        action === 'APPROVE' ? 'TICKET_APPROVED' : 'TICKET_REJECTED',
        user.userId,
        societyId,
        ticketIds[0],
        JSON.stringify({ action, bulkCount: ticketIds.length }),
        JSON.stringify({ reviewedBy: user.fullName, processed, failed, skippedSelf }),
      ]
    );

    await client.query('COMMIT');

    const message = skippedSelf > 0
      ? `${processed} tickets ${action.toLowerCase()}d. ${skippedSelf} skipped (cannot approve your own ticket).`
      : undefined;

    return NextResponse.json({ success: true, processed, failed, skippedSelf, message });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bulk review error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
