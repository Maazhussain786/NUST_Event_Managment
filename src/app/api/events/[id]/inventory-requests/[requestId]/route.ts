export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable, leadsTeam } from '@/lib/rbac';
import { applyInventoryTxn, alertLowStock } from '@/lib/inventory';
import { cleanText, isUuid } from '@/lib/event-workspace';
import { notifyUser } from '@/lib/notify';

/**
 * PATCH /api/events/[id]/inventory-requests/[requestId]  (FR-LOG-03/04)
 *   APPROVE | REJECT        Logistics / Admins
 *   ISSUE                   Logistics / Admins — takes items out of stock
 *   RETURN { returned, damaged, lost }  Logistics / Admins — must add up to what was issued
 *   CANCEL                  the requesting Team Lead or Logistics, before issue
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    if (!isUuid(params.requestId)) return ApiErrors.notFound('Request');
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase();
    const note = cleanText(body.note, 1000);
    const manage = rules.manageInventoryForEvent(access);

    await client.query('BEGIN');
    const result = await client.query(
      `SELECT r.*, i.name AS item_name FROM inventory_requests r JOIN inventory_items i ON i.id = r.item_id
       WHERE r.id = $1 AND r.event_id = $2 FOR UPDATE OF r`,
      [params.requestId, params.id],
    );
    const request = result.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Request');
    }
    const fail = async (res: NextResponse) => {
      await client.query('ROLLBACK');
      return res;
    };
    const societyId = access.event.society_id;
    let newStatus: string;
    let lowStockItem: { name: string; quantity_available: number; low_stock_threshold: number } | null = null;

    switch (action) {
      case 'APPROVE':
      case 'REJECT': {
        if (!manage) return fail(forbidden('Only Logistics can review item requests.'));
        if (request.status !== 'PENDING') return fail(ApiErrors.conflict(`Request is already ${request.status.toLowerCase()}`));
        if (action === 'REJECT' && !note) return fail(ApiErrors.validation('Give a reason for rejecting'));
        newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        await client.query(
          `UPDATE inventory_requests SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_note = $4, updated_at = NOW() WHERE id = $1`,
          [request.id, newStatus, user.userId, note],
        );
        break;
      }
      case 'ISSUE': {
        if (!manage) return fail(forbidden('Only Logistics can issue items.'));
        if (request.status !== 'APPROVED') return fail(ApiErrors.conflict('Approve the request before issuing.'));
        const txn = await applyInventoryTxn(client, {
          societyId, itemId: request.item_id, type: 'ISSUE', quantity: request.quantity,
          actorId: user.userId, note, requestId: request.id, eventId: params.id,
        });
        if (!txn.ok) return fail(ApiErrors.conflict(txn.error));
        lowStockItem = txn.item;
        newStatus = 'ISSUED';
        await client.query(
          `UPDATE inventory_requests SET status = 'ISSUED', quantity_issued = $2, updated_at = NOW() WHERE id = $1`,
          [request.id, request.quantity],
        );
        break;
      }
      case 'RETURN': {
        if (!manage) return fail(forbidden('Only Logistics can receive items back.'));
        if (request.status !== 'ISSUED') return fail(ApiErrors.conflict('Only issued items can be returned.'));
        const returned = Number(body.returned ?? request.quantity_issued);
        const damaged = Number(body.damaged ?? 0);
        const lost = Number(body.lost ?? 0);
        if (![returned, damaged, lost].every((n) => Number.isInteger(n) && n >= 0)) return fail(ApiErrors.validation('Counts must be whole numbers'));
        if (returned + damaged + lost !== request.quantity_issued) {
          return fail(ApiErrors.validation(`Returned + damaged + lost must equal ${request.quantity_issued} (the number issued)`));
        }
        if ((damaged > 0 || lost > 0) && !note) return fail(ApiErrors.validation('Explain the damage or loss in the note'));
        const steps: Array<['RETURN' | 'DAMAGE' | 'LOSS', number]> = [['RETURN', returned], ['DAMAGE', damaged], ['LOSS', lost]];
        for (const [type, qty] of steps) {
          if (qty === 0) continue;
          const txn = await applyInventoryTxn(client, {
            societyId, itemId: request.item_id, type, quantity: qty, actorId: user.userId, note,
            requestId: request.id, eventId: params.id, fromIssued: type !== 'RETURN',
          });
          if (!txn.ok) return fail(ApiErrors.conflict(txn.error));
          lowStockItem = txn.item;
        }
        newStatus = 'RETURNED';
        await client.query(
          `UPDATE inventory_requests SET status = 'RETURNED', quantity_returned = $2, review_note = COALESCE($3, review_note), updated_at = NOW() WHERE id = $1`,
          [request.id, returned, note],
        );
        break;
      }
      case 'CANCEL': {
        const own = request.requested_by === user.userId || leadsTeam(access, request.team_id);
        if (!manage && !own) return fail(forbidden('You cannot cancel this request.'));
        if (!['PENDING', 'APPROVED'].includes(request.status)) return fail(ApiErrors.conflict('Only pending or approved requests can be cancelled.'));
        newStatus = 'CANCELLED';
        await client.query(`UPDATE inventory_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [request.id]);
        break;
      }
      default:
        return fail(ApiErrors.validation('action must be APPROVE, REJECT, ISSUE, RETURN or CANCEL'));
    }

    await writeAuditLog(
      {
        action: `INVENTORY_REQUEST_${action}`,
        performedBy: user.userId,
        societyId,
        targetType: 'inventory_request',
        targetId: request.id,
        oldValue: { status: request.status },
        newValue: { status: newStatus, note },
      },
      client,
    );
    await client.query('COMMIT');

    if (lowStockItem) await alertLowStock(societyId, lowStockItem);
    if (request.requested_by !== user.userId && ['APPROVED', 'REJECTED', 'ISSUED'].includes(newStatus)) {
      await notifyUser(request.requested_by, {
        title: `Item request ${newStatus.toLowerCase()}: ${request.item_name}`,
        body: `Your request for ${request.quantity} × ${request.item_name} was ${newStatus.toLowerCase()}.${note ? ` Note: ${note}` : ''}`,
        link: `/society/${societyId}/events/${params.id}/workspace?tab=inventory`,
      });
    }
    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Inventory request action error:', error);
  } finally {
    client.release();
  }
}
