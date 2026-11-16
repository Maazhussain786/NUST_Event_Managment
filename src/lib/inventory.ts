import type { PoolClient } from 'pg';
import { query } from './db';
import type { JWTPayload } from './auth';
import { getSocietyAccess, can, FUNCTION, type SocietyAccess } from './rbac';
import { notifyUsers, usersWithSocietyPrivilege } from './notify';

/**
 * Inventory access at society level (SRS 4.10, matrix 8.1):
 *   manage: MANAGE_INVENTORY, or a Logistics team member of a live event
 *   view:   managers, VIEW_INVENTORY, anyone on a live event team, Event Heads
 */
export interface InventoryAccess {
  society: SocietyAccess;
  canManage: boolean;
  canView: boolean;
}

export async function getInventoryAccess(user: JWTPayload, societyId: string): Promise<InventoryAccess | null> {
  const society = await getSocietyAccess(user, societyId);
  if (!society) return null;
  if (!society.isMember && !society.isSuperAdmin) return { society, canManage: false, canView: false };

  const standing = await query(
    `SELECT
       EXISTS (SELECT 1 FROM event_team_members etm
               JOIN event_teams et ON et.id = etm.team_id AND et.is_active
               JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL AND e.archived_at IS NULL
               JOIN portfolios p ON p.id = et.portfolio_id
               WHERE etm.society_id = $1 AND etm.user_id = $2 AND etm.removed_at IS NULL AND p.function_key = $3) AS logistics,
       EXISTS (SELECT 1 FROM event_team_members etm
               JOIN events e ON e.id = etm.event_id AND e.deleted_at IS NULL AND e.archived_at IS NULL
               WHERE etm.society_id = $1 AND etm.user_id = $2 AND etm.removed_at IS NULL) AS on_team,
       EXISTS (SELECT 1 FROM events WHERE society_id = $1 AND event_head_id = $2 AND deleted_at IS NULL AND archived_at IS NULL) AS event_head`,
    [societyId, user.userId, FUNCTION.LOGISTICS],
  );
  const s = standing.rows[0];
  const canManage = can(society, 'MANAGE_INVENTORY') || s.logistics;
  return { society, canManage, canView: canManage || can(society, 'VIEW_INVENTORY') || s.on_team || s.event_head };
}

export const TXN_TYPES = ['ADD', 'REMOVE', 'DAMAGE', 'LOSS', 'REPAIR'] as const;
export const OWNERSHIP = ['OWNED', 'BORROWED', 'RENTED'] as const;
export const CONDITIONS = ['GOOD', 'NEEDS_REPAIR', 'DAMAGED'] as const;

/**
 * Applies a quantity change to an item inside a transaction (row-locked) and logs it.
 *   ADD / REPAIR:          total +q, available +q
 *   REMOVE / DAMAGE / LOSS: total -q, available -q   (taken from available stock)
 *   ISSUE:                 available -q
 *   RETURN:                available +q
 */
export async function applyInventoryTxn(
  client: PoolClient,
  args: {
    societyId: string;
    itemId: string;
    type: 'ADD' | 'REMOVE' | 'DAMAGE' | 'LOSS' | 'REPAIR' | 'ISSUE' | 'RETURN';
    quantity: number;
    actorId: string;
    note?: string | null;
    requestId?: string | null;
    eventId?: string | null;
    /** For DAMAGE/LOSS of items that were out on loan: they are not in available stock. */
    fromIssued?: boolean;
  },
): Promise<{ ok: true; item: { name: string; quantity_available: number; low_stock_threshold: number } } | { ok: false; error: string }> {
  const lock = await client.query(
    `SELECT id, name, quantity_total, quantity_available, low_stock_threshold
     FROM inventory_items WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [args.itemId, args.societyId],
  );
  const item = lock.rows[0];
  if (!item) return { ok: false, error: 'Item not found' };

  const q = args.quantity;
  let total = item.quantity_total;
  let available = item.quantity_available;
  switch (args.type) {
    case 'ADD':
    case 'REPAIR':
      total += q; available += q; break;
    case 'REMOVE':
    case 'DAMAGE':
    case 'LOSS':
      total -= q;
      if (!args.fromIssued) available -= q;
      break;
    case 'ISSUE':
      available -= q; break;
    case 'RETURN':
      available += q; break;
  }
  if (available < 0) return { ok: false, error: `Only ${item.quantity_available} ${item.name} available` };
  if (total < 0 || available > total) return { ok: false, error: 'That would make the stock count invalid' };

  await client.query(
    'UPDATE inventory_items SET quantity_total = $2, quantity_available = $3, updated_at = NOW() WHERE id = $1',
    [item.id, total, available],
  );
  await client.query(
    `INSERT INTO inventory_transactions (society_id, item_id, request_id, event_id, txn_type, quantity, note, performed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [args.societyId, item.id, args.requestId ?? null, args.eventId ?? null, args.type, q, args.note ?? null, args.actorId],
  );
  return { ok: true, item: { name: item.name, quantity_available: available, low_stock_threshold: item.low_stock_threshold } };
}

/** FR-LOG-04: tell inventory managers when an item drops to its low-stock threshold. */
export async function alertLowStock(societyId: string, item: { name: string; quantity_available: number; low_stock_threshold: number }) {
  if (item.low_stock_threshold <= 0 || item.quantity_available > item.low_stock_threshold) return;
  await notifyUsers(await usersWithSocietyPrivilege(societyId, 'MANAGE_INVENTORY'), {
    title: `Low stock: ${item.name}`,
    body: `Only ${item.quantity_available} ${item.name} left in stock (threshold ${item.low_stock_threshold}).`,
    link: `/society/${societyId}/inventory`,
    push: false,
  });
}
