export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable } from '@/lib/rbac';
import { cleanText, isUuid, parseMoney } from '@/lib/event-workspace';

// GET /api/events/[id]/sponsorships — this event's sponsorship deals
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.viewSponsorsForEvent(access)) return forbidden('You cannot view sponsorships for this event.');

    const result = await query(
      `SELECT s.id, s.sponsor_id, sp.name AS sponsor_name, s.amount, s.status, s.deliverables, s.deliverables_status,
              s.received_on, s.payment_reference, s.verified_at, vu.full_name AS verified_by_name,
              s.created_at, s.updated_at, lu.full_name AS logged_by_name
       FROM sponsorships s
       JOIN sponsors sp ON sp.id = s.sponsor_id
       JOIN users lu ON lu.id = s.logged_by
       LEFT JOIN users vu ON vu.id = s.verified_by
       WHERE s.event_id = $1
       ORDER BY s.created_at DESC`,
      [params.id],
    );
    return NextResponse.json({
      sponsorships: result.rows,
      can_manage: rules.manageSponsorsForEvent(access) && eventIsEditable(access),
      can_verify: rules.verifyMoney(access) && eventIsEditable(access),
    });
  } catch (error) {
    return ApiErrors.serverError('Sponsorships list error:', error);
  }
}

// POST /api/events/[id]/sponsorships { sponsor_id, amount, status?, deliverables? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.manageSponsorsForEvent(access)) return forbidden('Only Outreach/Sponsors or Admins can record sponsorships.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    if (!isUuid(body.sponsor_id)) return ApiErrors.validation('Choose a sponsor');
    const sponsor = await query(
      'SELECT id, name FROM sponsors WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL',
      [body.sponsor_id, access.event.society_id],
    );
    if (sponsor.rows.length === 0) return ApiErrors.validation('Sponsor not found in this society');
    const amount = parseMoney(body.amount);
    if (amount === null || amount < 0) return ApiErrors.validation('Enter the sponsorship amount');
    const status = String(body.status || 'PROPOSED').toUpperCase();
    if (!['PROPOSED', 'CONFIRMED'].includes(status)) return ApiErrors.validation('New deals start as PROPOSED or CONFIRMED');

    const inserted = await query(
      `INSERT INTO sponsorships (society_id, sponsor_id, event_id, amount, status, deliverables, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [access.event.society_id, body.sponsor_id, params.id, amount, status, cleanText(body.deliverables, 4000), user.userId],
    );
    await writeAuditLog({
      action: 'SPONSORSHIP_RECORDED',
      performedBy: user.userId,
      societyId: access.event.society_id,
      targetType: 'sponsorship',
      targetId: inserted.rows[0].id,
      newValue: { sponsor: sponsor.rows[0].name, amount, status },
    });
    return NextResponse.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Record sponsorship error:', error);
  }
}
