export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable, FUNCTION } from '@/lib/rbac';
import { cleanText, isUuid, loadTeam, parseTimestamp } from '@/lib/event-workspace';
import { notifyUsers, usersInEventFunction, usersWithSocietyPrivilege } from '@/lib/notify';

// GET /api/events/[id]/inventory-requests — Logistics/Admins see all; others see their teams' requests
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;

    const manage = rules.manageInventoryForEvent(access);
    const seeAll = manage || access.isEventHead || rules.viewAllDuties(access);
    const myTeams = access.teams.map((t) => t.teamId);
    const result = await query(
      `SELECT r.id, r.team_id, p.name AS team_name, r.item_id, i.name AS item_name, i.unit, i.quantity_available,
              r.quantity, r.needed_from, r.needed_until, r.purpose, r.status, r.quantity_issued, r.quantity_returned,
              r.review_note, r.created_at, r.updated_at, ru.full_name AS requested_by_name, vu.full_name AS reviewed_by_name,
              r.requested_by
       FROM inventory_requests r
       JOIN inventory_items i ON i.id = r.item_id
       JOIN event_teams et ON et.id = r.team_id
       JOIN portfolios p ON p.id = et.portfolio_id
       JOIN users ru ON ru.id = r.requested_by
       LEFT JOIN users vu ON vu.id = r.reviewed_by
       WHERE r.event_id = $1 AND ($2::boolean OR r.team_id = ANY($3::uuid[]))
       ORDER BY CASE r.status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'ISSUED' THEN 2 ELSE 3 END, r.created_at DESC`,
      [params.id, seeAll, myTeams],
    );
    return NextResponse.json({
      requests: result.rows,
      can_manage: manage && eventIsEditable(access),
      requestable_team_ids: access.teams.filter((t) => t.teamRole === 'TEAM_LEAD').map((t) => t.teamId),
    });
  } catch (error) {
    return ApiErrors.serverError('Inventory requests error:', error);
  }
}

// POST /api/events/[id]/inventory-requests { team_id, item_id, quantity, needed_from?, needed_until?, purpose? } (FR-LOG-02)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const team = body.team_id ? await loadTeam(params.id, String(body.team_id)) : null;
    if (!team || !team.is_active) return ApiErrors.validation('Choose your team');
    if (!rules.requestInventoryFor(access, team.id)) return forbidden('Only the team\'s Team Lead can request items.');
    if (!isUuid(body.item_id)) return ApiErrors.validation('Choose an item');
    const item = await query(
      'SELECT id, name, quantity_total FROM inventory_items WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL',
      [body.item_id, access.event.society_id],
    );
    if (item.rows.length === 0) return ApiErrors.validation('Item not found');
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) return ApiErrors.validation('Quantity must be a positive whole number');
    if (quantity > item.rows[0].quantity_total) return ApiErrors.validation(`Only ${item.rows[0].quantity_total} exist in total`);
    const neededFrom = body.needed_from ? parseTimestamp(body.needed_from) : null;
    const neededUntil = body.needed_until ? parseTimestamp(body.needed_until) : null;
    if (neededFrom && neededUntil && neededUntil <= neededFrom) return ApiErrors.validation('"Needed until" must be after "needed from"');

    const inserted = await query(
      `INSERT INTO inventory_requests (society_id, event_id, team_id, item_id, quantity, needed_from, needed_until, purpose, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [access.event.society_id, params.id, team.id, body.item_id, quantity, neededFrom, neededUntil, cleanText(body.purpose, 1000), user.userId],
    );
    await writeAuditLog({
      action: 'INVENTORY_REQUESTED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'inventory_request',
      targetId: inserted.rows[0].id,
      newValue: { item: item.rows[0].name, quantity, team: team.portfolio_name },
    });

    const logistics = await usersInEventFunction(params.id, FUNCTION.LOGISTICS);
    const recipients = logistics.length > 0 ? logistics : await usersWithSocietyPrivilege(access.event.society_id, 'MANAGE_INVENTORY');
    await notifyUsers(recipients, {
      title: `Item request: ${item.rows[0].name}`,
      body: `${team.portfolio_name} requested ${quantity} × ${item.rows[0].name} for "${access.event.title}".`,
      link: `/society/${access.event.society_id}/events/${params.id}/workspace?tab=inventory`,
      push: false,
    });
    return NextResponse.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Request inventory error:', error);
  }
}
