export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient, query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden } from '@/lib/rbac';
import { getInventoryAccess, applyInventoryTxn, OWNERSHIP, CONDITIONS } from '@/lib/inventory';
import { cleanText, parseDateOnly } from '@/lib/event-workspace';

// GET /api/societies/[id]/inventory — items with stock, issued and damage/loss counts (FR-LOG-01/04)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getInventoryAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canView) return forbidden('You cannot view the inventory.');

    const result = await query(
      `SELECT i.id, i.name, i.category, i.unit, i.quantity_total, i.quantity_available, i.condition, i.location,
              i.ownership, i.owner_name, i.return_due, i.low_stock_threshold, i.notes, i.updated_at,
              (i.quantity_total - i.quantity_available) AS quantity_issued,
              (i.low_stock_threshold > 0 AND i.quantity_available <= i.low_stock_threshold) AS low_stock,
              COALESCE((SELECT SUM(quantity) FROM inventory_transactions t WHERE t.item_id = i.id AND t.txn_type = 'DAMAGE'), 0)::int AS damaged_total,
              COALESCE((SELECT SUM(quantity) FROM inventory_transactions t WHERE t.item_id = i.id AND t.txn_type = 'LOSS'), 0)::int AS lost_total,
              (SELECT COUNT(*) FROM inventory_requests r WHERE r.item_id = i.id AND r.status = 'PENDING')::int AS pending_requests
       FROM inventory_items i
       WHERE i.society_id = $1 AND i.deleted_at IS NULL
       ORDER BY i.category NULLS LAST, i.name`,
      [params.id],
    );
    return NextResponse.json({ items: result.rows, can_manage: access.canManage });
  } catch (error) {
    return ApiErrors.serverError('Inventory list error:', error);
  }
}

// POST /api/societies/[id]/inventory — add an item (initial quantity is logged as an ADD movement)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getInventoryAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canManage) return forbidden('Only Logistics or Admins can add inventory.');

    const body = await req.json().catch(() => ({}));
    const name = cleanText(body.name, 200);
    if (!name) return ApiErrors.validation('Item name is required');
    const quantity = Number(body.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) return ApiErrors.validation('Quantity must be a whole number');
    const ownership = String(body.ownership || 'OWNED').toUpperCase();
    if (!(OWNERSHIP as readonly string[]).includes(ownership)) return ApiErrors.validation('Invalid ownership');
    const condition = String(body.condition || 'GOOD').toUpperCase();
    if (!(CONDITIONS as readonly string[]).includes(condition)) return ApiErrors.validation('Invalid condition');
    const threshold = Number(body.low_stock_threshold ?? 0);
    if (!Number.isInteger(threshold) || threshold < 0) return ApiErrors.validation('Low-stock threshold must be a whole number');
    const returnDue = body.return_due ? parseDateOnly(body.return_due) : null;
    if (body.return_due && !returnDue) return ApiErrors.validation('Return date must be YYYY-MM-DD');
    if (ownership !== 'OWNED' && !cleanText(body.owner_name, 200)) return ApiErrors.validation('Say who the item is borrowed/rented from');

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO inventory_items (society_id, name, category, unit, condition, location, ownership, owner_name,
                                    return_due, low_stock_threshold, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [params.id, name, cleanText(body.category, 100), cleanText(body.unit, 30) ?? 'pcs', condition,
        cleanText(body.location, 200), ownership, cleanText(body.owner_name, 200), returnDue, threshold,
        cleanText(body.notes, 2000), user.userId],
    );
    const itemId = inserted.rows[0].id;
    if (quantity > 0) {
      const txn = await applyInventoryTxn(client, { societyId: params.id, itemId, type: 'ADD', quantity, actorId: user.userId, note: 'Initial stock' });
      if (!txn.ok) {
        await client.query('ROLLBACK');
        return ApiErrors.validation(txn.error);
      }
    }
    await writeAuditLog(
      { action: 'INVENTORY_ITEM_ADDED', performedBy: user.userId, societyId: params.id, targetType: 'inventory_item', targetId: itemId, newValue: { name, quantity, ownership } },
      client,
    );
    await client.query('COMMIT');
    return NextResponse.json({ success: true, id: itemId }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Add inventory item error:', error);
  } finally {
    client.release();
  }
}
