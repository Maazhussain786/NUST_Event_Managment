export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// PATCH /api/societies/[id]/governance/ticket-approvals/[ticketId] — approve/reject a single ticket
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; ticketId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, ticketId } = params;
    const body = await req.json();
    const { action, reason } = body;

    if (!['APPROVE', 'REJECT', 'NEEDS_REUPLOAD'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Verify membership with hierarchy >= 3 or VERIFY_PAYMENTS privilege
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'VERIFY_PAYMENTS') AS allowed`,
      [user.userId, societyId]
    );
    if (!privCheck.rows[0].allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch ticket with version check
    const ticketResult = await client.query(
      `SELECT t.id, t.status, t.event_id, t.user_id, e.title AS event_title
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       WHERE t.id = $1 AND e.society_id = $2
       FOR UPDATE`,
      [ticketId, societyId]
    );

    if (ticketResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ticket = ticketResult.rows[0];

    if (ticket.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `Ticket already ${ticket.status.toLowerCase()}`, code: 'ALREADY_REVIEWED' },
        { status: 409 }
      );
    }

    if (action === 'APPROVE') {
      await client.query(
        `UPDATE tickets SET status = 'APPROVED', approved_at = NOW(), approved_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [user.userId, ticketId]
      );
    } else if (action === 'REJECT') {
      await client.query(
        `UPDATE tickets SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`,
        [ticketId]
      );
      // Update payment proof rejection reason if provided
      if (reason) {
        await client.query(
          `UPDATE payment_proofs SET status = 'REJECTED', rejection_reason = $1, verified_by = $2, verified_at = NOW(), updated_at = NOW()
           WHERE ticket_id = $3 AND status = 'PENDING'`,
          [reason, user.userId, ticketId]
        );
      }
    } else if (action === 'NEEDS_REUPLOAD') {
      // Reset proof but keep ticket PENDING
      await client.query(
        `UPDATE payment_proofs SET status = 'REJECTED', rejection_reason = $1, verified_by = $2, verified_at = NOW(), updated_at = NOW()
         WHERE ticket_id = $3 AND status = 'PENDING'`,
        [reason || 'Please re-upload payment proof', user.userId, ticketId]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ($1, $2, $3, 'ticket', $4, $5, $6)`,
      [
        action === 'APPROVE' ? 'TICKET_APPROVED' : 'TICKET_REJECTED',
        user.userId,
        societyId,
        ticketId,
        JSON.stringify({ action, reason }),
        JSON.stringify({ eventTitle: ticket.event_title, reviewedBy: user.fullName }),
      ]
    );

    // Send notification to buyer
    await client.query(
      `INSERT INTO notifications (user_id, title, body, link)
       VALUES ($1, $2, $3, $4)`,
      [
        ticket.user_id,
        action === 'APPROVE' ? 'Ticket Approved' : action === 'REJECT' ? 'Ticket Rejected' : 'Re-upload Required',
        action === 'APPROVE'
          ? `Your ticket for "${ticket.event_title}" has been approved!`
          : action === 'REJECT'
          ? `Your ticket for "${ticket.event_title}" was rejected. ${reason || ''}`
          : `Please re-upload payment proof for "${ticket.event_title}". ${reason || ''}`,
        `/events/${ticket.event_id}`,
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Ticket ${action.toLowerCase()}d successfully`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Review ticket error:', error);
    return NextResponse.json({ error: 'Failed to review ticket' }, { status: 500 });
  } finally {
    client.release();
  }
}
