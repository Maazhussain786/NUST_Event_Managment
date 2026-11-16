export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { getSocietyAccess, can, forbidden } from '@/lib/rbac';
import { isUuid } from '@/lib/event-workspace';

/**
 * GET /api/societies/[id]/governance/role-changes?user_id=&limit=  (FR-ROLE-06)
 * Every role change in the society with who, when and why — society roles,
 * Event Heads and team places. Visible to MANAGE_ROLES or VIEW_AUDIT_LOGS holders.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getSocietyAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!can(access, 'MANAGE_ROLES') && !can(access, 'VIEW_AUDIT_LOGS')) return forbidden('You cannot view the role history.');

    const userId = req.nextUrl.searchParams.get('user_id');
    const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 200)));
    const result = await query(
      `SELECT l.id, l.scope_type, l.change_type, l.from_role, l.to_role, l.source, l.reason, l.created_at,
              u.full_name AS user_name, u.email AS user_email, cu.full_name AS changed_by_name,
              CASE l.scope_type
                WHEN 'EVENT' THEN (SELECT title FROM events WHERE id = l.scope_id)
                WHEN 'TEAM' THEN (SELECT p.name || ' — ' || e.title FROM event_teams et
                                  JOIN portfolios p ON p.id = et.portfolio_id JOIN events e ON e.id = et.event_id
                                  WHERE et.id = l.scope_id)
                ELSE NULL END AS scope_name
       FROM role_change_log l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN users cu ON cu.id = l.changed_by
       WHERE l.society_id = $1 AND ($2::uuid IS NULL OR l.user_id = $2)
       ORDER BY l.created_at DESC
       LIMIT $3`,
      [params.id, isUuid(userId) ? userId : null, limit],
    );
    return NextResponse.json({ changes: result.rows });
  } catch (error) {
    return ApiErrors.serverError('Role history error:', error);
  }
}
