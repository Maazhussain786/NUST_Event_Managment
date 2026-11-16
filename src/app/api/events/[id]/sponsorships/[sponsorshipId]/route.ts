export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable, FUNCTION } from '@/lib/rbac';
import { DELIVERABLE_STATUSES } from '@/lib/sponsors';
import { cleanText, isUuid, parseDateOnly, parseMoney } from '@/lib/event-workspace';
import { notifyUsers, usersInEventFunction } from '@/lib/notify';

const NEXT_STATUS: Record<string, string[]> = {
  PROPOSED: ['CONFIRMED', 'DECLINED'],
  CONFIRMED: ['RECEIVED', 'DECLINED'],
  RECEIVED: [],
  DECLINED: ['PROPOSED'],
};

/**
 * PATCH /api/events/[id]/sponsorships/[sponsorshipId]
 *   Outreach/Admins: { status?, amount?, deliverables?, deliverables_status?, received_on?, payment_reference? }
 *   Finance:         { action: 'VERIFY' } — confirms received money (SRS 4.9 step 2). Verified deals are locked.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; sponsorshipId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    if (!isUuid(params.sponsorshipId)) return ApiErrors.notFound('Sponsorship');
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const current = await query(
      `SELECT s.*, sp.name AS sponsor_name FROM sponsorships s JOIN sponsors sp ON sp.id = s.sponsor_id
       WHERE s.id = $1 AND s.event_id = $2`,
      [params.sponsorshipId, params.id],
    );
    const deal = current.rows[0];
    if (!deal) return ApiErrors.notFound('Sponsorship');
    const body = await req.json().catch(() => ({}));

    if (String(body.action || '').toUpperCase() === 'VERIFY') {
      if (!rules.verifyMoney(access)) return forbidden('Only Finance can verify received money.');
      if (deal.status !== 'RECEIVED') return ApiErrors.conflict('Only received money can be verified.');
      if (deal.verified_at) return ApiErrors.conflict('Already verified.');
      if (deal.logged_by === user.userId) return forbidden('You cannot verify a deal you recorded.');
      await query('UPDATE sponsorships SET verified_by = $2, verified_at = NOW(), updated_at = NOW() WHERE id = $1', [deal.id, user.userId]);
      await writeAuditLog({
        action: 'SPONSORSHIP_VERIFIED',
        performedBy: user.userId,
        societyId: access.event.society_id,
        targetType: 'sponsorship',
        targetId: deal.id,
        newValue: { amount: deal.amount, sponsor: deal.sponsor_name },
      });
      return NextResponse.json({ success: true });
    }

    if (!rules.manageSponsorsForEvent(access)) return forbidden('Only Outreach/Sponsors or Admins can update sponsorships.');
    if (deal.verified_at && (body.amount !== undefined || body.status !== undefined || body.received_on !== undefined)) {
      return ApiErrors.conflict('Verified sponsorship money is locked.');
    }

    let status = deal.status;
    if (body.status !== undefined && body.status !== deal.status) {
      status = String(body.status).toUpperCase();
      if (!NEXT_STATUS[deal.status]?.includes(status)) return ApiErrors.validation(`Cannot move from ${deal.status} to ${status}`);
    }
    let amount = Number(deal.amount);
    if (body.amount !== undefined) {
      const parsed = parseMoney(body.amount);
      if (parsed === null || parsed < 0) return ApiErrors.validation('Invalid amount');
      amount = parsed;
    }
    let receivedOn = deal.received_on;
    if (body.received_on !== undefined) {
      receivedOn = body.received_on ? parseDateOnly(body.received_on) : null;
      if (body.received_on && !receivedOn) return ApiErrors.validation('Received date must be YYYY-MM-DD');
    }
    if (status === 'RECEIVED' && !receivedOn) return ApiErrors.validation('Enter the date the money was received');
    const deliverablesStatus = body.deliverables_status !== undefined ? String(body.deliverables_status).toUpperCase() : deal.deliverables_status;
    if (!(DELIVERABLE_STATUSES as readonly string[]).includes(deliverablesStatus)) return ApiErrors.validation('Invalid deliverables status');

    await query(
      `UPDATE sponsorships SET status = $2, amount = $3, received_on = $4, deliverables = $5, deliverables_status = $6,
              payment_reference = $7, updated_at = NOW()
       WHERE id = $1`,
      [deal.id, status, amount, receivedOn,
        body.deliverables !== undefined ? cleanText(body.deliverables, 4000) : deal.deliverables,
        deliverablesStatus,
        body.payment_reference !== undefined ? cleanText(body.payment_reference, 200) : deal.payment_reference],
    );
    await writeAuditLog({
      action: 'SPONSORSHIP_UPDATED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'sponsorship',
      targetId: deal.id,
      oldValue: { status: deal.status, amount: deal.amount },
      newValue: { status, amount },
    });

    if (status === 'RECEIVED' && deal.status !== 'RECEIVED') {
      await notifyUsers(await usersInEventFunction(params.id, FUNCTION.FINANCE, true), {
        title: `Sponsorship received: ${deal.sponsor_name}`,
        body: `Rs ${amount.toLocaleString()} from ${deal.sponsor_name} was marked received for "${access.event.title}". Please verify it.`,
        link: `/society/${access.event.society_id}/events/${params.id}/workspace?tab=sponsors`,
        email: true,
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Update sponsorship error:', error);
  }
}
