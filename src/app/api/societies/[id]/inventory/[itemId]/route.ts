export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden } from '@/lib/rbac';
import { getInventoryAccess, applyInventoryTxn, alertLowStock, TXN_TYPES, OWNERSHIP, CONDITIONS } from '@/lib/inventory';
import { cleanText, isUuid, parseDateOnly } from '@/lib/event-workspace';

async function loadItem(societyId: string, itemId: string) {
  if (!isUuid(itemId)) return null;
  const r = await query('SELECT * FROM inventory_items WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL', [itemId, societyId]);
  return r.rows[0] ?? null;
}

// GET /api/societies/[id]/inventory/[itemId] — item with its full movement log (FR-LOG-05)
export async function GET(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getInventoryAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canView) return forbidden('You cannot view the inventory.');
    const item = await loadItem(params.id, params.itemId);
    if (!item) return ApiErrors.notFound('Item');

    const txns = await query(
      `SELECT t.id, t.txn_type, t.quantity, t.note, t.created_at, t.request_id, e.title AS event_title,
              u.full_name AS performed_by_name
       FROM inventory_transactions t JOIN users u ON u.id = t.performed_by LEFT JOIN events e ON e.id = t.event_id
       WHERE t.item_id = $1 ORDER BY t.created_at DESC LIMIT 300`,
      [item.id],
    );
    return NextResponse.json({ item, transactions: txns.rows, can_manage: access.canManage });
  } catch (error) {
    return ApiErrors.serverError('Inventory item error:', error);
  }
}

/**
 * PATCH /api/societies/[id]/inventory/[itemId]
 *   { name?, category?, unit?, condition?, location?, ownership?, owner_name?, return_due?, low_stock_threshold?, notes? }
 *   or a stock movement: { txn_type: ADD | REMOVE | DAMAGE | LOSS | REPAIR, quantity, note }
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getInventoryAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canManage) return forbidden('Only Logistics or Admins can change inventory.');
    const item = await loadItem(params.id, params.itemId);
    if (!item) return ApiErrors.notFound('Item');
    const body = await req.json().catch(() => ({}));

    if (body.txn_type !== undefined) {
      const type = String(body.txn_type).toUpperCase() as (typeof TXN_TYPES)[number];
      if (!TXN_TYPES.includes(type)) return ApiErrors.validation('Invalid movement type');
      const quantity = Number(body.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) return ApiErrors.validation('Quantity must be a positive whole number');
      const note = cleanText(body.note, 1000);
      if (type !== 'ADD' && !note) return ApiErrors.validation('Add a note explaining this change');

      await client.query('BEGIN');
      const txn = await applyInventoryTxn(client, { societyId: params.id, itemId: item.id, type, quantity, actorId: user.userId, note });
      if (!txn.ok) {
        await client.query('ROLLBACK');
        return ApiErrors.validation(txn.error);
      }
      await writeAuditLog(
        { action: `INVENTORY_${type}`, performedBy: user.userId, societyId: params.id, targetType: 'inventory_item', targetId: item.id, newValue: { quantity, note } },
        client,
      );
      await client.query('COMMIT');
      await alertLowStock(params.id, txn.item);
      return NextResponse.json({ success: true, quantity_available: txn.item.quantity_available });
    }

    const pick = (key: string, max: number) => (body[key] !== undefined ? cleanText(body[key], max) : item[key]);
    const name = pick('name', 200);
    if (!name) return ApiErrors.validation('Item name is required');
    const ownership = body.ownership !== undefined ? String(body.ownership).toUpperCase() : item.ownership;
    if (!(OWNERSHIP as readonly string[]).includes(ownership)) return ApiErrors.validation('Invalid ownership');
    const condition = body.condition !== undefined ? String(body.condition).toUpperCase() : item.condition;
    if (!(CONDITIONS as readonly string[]).includes(condition)) return ApiErrors.validation('Invalid condition');
    const threshold = body.low_stock_threshold !== undefined ? Number(body.low_stock_threshold) : item.low_stock_threshold;
    if (!Number.isInteger(threshold) || threshold < 0) return ApiErrors.validation('Low-stock threshold must be a whole number');
    let returnDue = item.return_due;
    if (body.return_due !== undefined) {
      returnDue = body.return_due ? parseDateOnly(body.return_due) : null;
      if (body.return_due && !returnDue) return ApiErrors.validation('Return date must be YYYY-MM-DD');
    }

    await query(
      `UPDATE inventory_items SET name = $2, category = $3, unit = $4, condition = $5, location = $6, ownership = $7,
              owner_name = $8, return_due = $9, low_stock_threshold = $10, notes = $11, updated_at = NOW()
       WHERE id = $1`,
      [item.id, name, pick('category', 100), pick('unit', 30) ?? 'pcs', condition, pick('location', 200), ownership,
        pick('owner_name', 200), returnDue, threshold, pick('notes', 2000)],
    );
    await writeAuditLog({
      action: 'INVENTORY_ITEM_UPDATED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'inventory_item',
      targetId: item.id,
      oldValue: { name: item.name, condition: item.condition, location: item.location },
      newValue: { name, condition, location: pick('location', 200) },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Update inventory item error:', error);
  } finally {
    client.release();
  }
}

// DELETE /api/societies/[id]/inventory/[itemId] — retire an item that is not out on loan
export async function DELETE(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getInventoryAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canManage) return forbidden('Only Logistics or Admins can remove inventory.');
    const item = await loadItem(params.id, params.itemId);
    if (!item) return ApiErrors.notFound('Item');
    if (item.quantity_available < item.quantity_total) return ApiErrors.conflict('Some of this item is still issued. Receive it back first.');
    const open = await query(`SELECT 1 FROM inventory_requests WHERE item_id = $1 AND status IN ('PENDING', 'APPROVED') LIMIT 1`, [item.id]);
    if (open.rows.length > 0) return ApiErrors.conflict('There are open requests for this item.');

    await query('UPDATE inventory_items SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [item.id]);
    await writeAuditLog({ action: 'INVENTORY_ITEM_RETIRED', performedBy: user.userId, societyId: params.id, targetType: 'inventory_item', targetId: item.id, oldValue: { name: item.name } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return ApiErrors.serverError('Retire inventory item error:', error);
  }
}
