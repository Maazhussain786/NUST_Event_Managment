export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable } from '@/lib/rbac';
import { isUuid } from '@/lib/event-workspace';

/**
 * POST /api/events/[id]/teams { portfolio_ids: string[] }  (FR-TEAM-04)
 * Activates portfolios for this event (creates the event teams). MANAGE_TEAMS.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.manageTeams(access)) return forbidden('You do not have permission to manage event teams.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const ids: string[] = (Array.isArray(body.portfolio_ids) ? body.portfolio_ids : [body.portfolio_id]).filter(isUuid);
    if (ids.length === 0) return ApiErrors.validation('Choose at least one portfolio');

    await client.query('BEGIN');
    const valid = await client.query(
      `SELECT id FROM portfolios WHERE id = ANY($1::uuid[]) AND society_id = $2 AND deleted_at IS NULL`,
      [ids, access.event.society_id],
    );
    if (valid.rows.length !== ids.length) {
      await client.query('ROLLBACK');
      return ApiErrors.validation('Some portfolios do not belong to this society');
    }
    const created = await client.query(
      `INSERT INTO event_teams (society_id, event_id, portfolio_id, created_by)
       SELECT $1, $2, UNNEST($3::uuid[]), $4
       ON CONFLICT (event_id, portfolio_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()
       RETURNING id, portfolio_id`,
      [access.event.society_id, params.id, ids, user.userId],
    );
    await writeAuditLog(
      {
        action: 'EVENT_TEAMS_ACTIVATED',
        performedBy: user.userId,
        societyId: access.event.society_id,
        targetType: 'event',
        targetId: params.id,
        newValue: { portfolio_ids: ids },
      },
      client,
    );
    await client.query('COMMIT');
    return NextResponse.json({ success: true, teams: created.rows }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Activate teams error:', error);
  } finally {
    client.release();
  }
}
