export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { requireEventWorkspace, rules, forbidden, eventIsEditable, ensureSocietyMember, setChangeContext, RbacError } from '@/lib/rbac';
import { resolveActiveUser } from '@/lib/event-workspace';
import { notifyUser } from '@/lib/notify';

/**
 * PUT /api/events/[id]/event-head { user_id | email | null, reason }  (FR-ROLE-05)
 * Assigns, replaces or clears the optional Event Head. MANAGE_TEAMS.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireEventWorkspace(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!rules.manageTeams(access)) return forbidden('Only Admins can assign the Event Head.');
    if (!eventIsEditable(access)) return ApiErrors.conflict('This event is archived.');

    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || '').trim() || null;
    const clearing = body.user_id === null && !body.email;
    const person = clearing ? null : await resolveActiveUser(body);
    if (!clearing && !person) return ApiErrors.validation('No active account found for that person.');

    await client.query('BEGIN');
    await setChangeContext(client, { actorId: user.userId, reason: reason ?? (person ? 'Assigned Event Head' : 'Event Head cleared') });
    if (person) await ensureSocietyMember(client, access.event.society_id, person.id, user.userId);
    await client.query('UPDATE events SET event_head_id = $2, updated_at = NOW() WHERE id = $1', [params.id, person?.id ?? null]);
    await writeAuditLog(
      {
        action: 'EVENT_HEAD_SET',
        performedBy: user.userId,
        societyId: access.event.society_id,
        targetType: 'event',
        targetId: params.id,
        oldValue: { event_head_id: access.event.event_head_id },
        newValue: { event_head_id: person?.id ?? null },
        metadata: { reason },
      },
      client,
    );
    await client.query('COMMIT');

    if (person) {
      await notifyUser(person.id, {
        title: 'You are the Event Head',
        body: `You were made Event Head of "${access.event.title}".`,
        link: `/society/${access.event.society_id}/events/${params.id}/workspace`,
        email: true,
      });
    }
    return NextResponse.json({ success: true, event_head_id: person?.id ?? null });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof RbacError) return ApiErrors.conflict(error.message);
    return ApiErrors.serverError('Set event head error:', error);
  } finally {
    client.release();
  }
}
