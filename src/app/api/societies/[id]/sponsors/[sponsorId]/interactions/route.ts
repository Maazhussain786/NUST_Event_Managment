export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { forbidden } from '@/lib/rbac';
import { getSponsorAccess, INTERACTION_TYPES } from '@/lib/sponsors';
import { cleanText, isUuid, parseDateOnly } from '@/lib/event-workspace';

/**
 * POST /api/societies/[id]/sponsors/[sponsorId]/interactions  (FR-SPN-02)
 * { interaction_type, summary, occurred_on?, event_id? } — append-only contact history.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; sponsorId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getSponsorAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canManage) return forbidden('Only Outreach/Sponsors or Admins can log sponsor interactions.');
    if (!isUuid(params.sponsorId)) return ApiErrors.notFound('Sponsor');

    const sponsor = await query('SELECT id FROM sponsors WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL', [params.sponsorId, params.id]);
    if (sponsor.rows.length === 0) return ApiErrors.notFound('Sponsor');

    const body = await req.json().catch(() => ({}));
    const type = String(body.interaction_type || '').toUpperCase();
    if (!(INTERACTION_TYPES as readonly string[]).includes(type)) return ApiErrors.validation('Choose an interaction type');
    const summary = cleanText(body.summary, 4000);
    if (!summary) return ApiErrors.validation('Summarise the interaction');
    const occurredOn = body.occurred_on ? parseDateOnly(body.occurred_on) : new Date().toISOString().slice(0, 10);
    if (!occurredOn) return ApiErrors.validation('Date must be YYYY-MM-DD');

    let eventId: string | null = null;
    if (body.event_id) {
      const ev = await query('SELECT id FROM events WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL', [body.event_id, params.id]);
      if (ev.rows.length === 0) return ApiErrors.validation('Event not found in this society');
      eventId = ev.rows[0].id;
    }

    const inserted = await query(
      `INSERT INTO sponsor_interactions (society_id, sponsor_id, event_id, interaction_type, summary, occurred_on, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [params.id, params.sponsorId, eventId, type, summary, occurredOn, user.userId],
    );
    await query('UPDATE sponsors SET updated_at = NOW() WHERE id = $1', [params.sponsorId]);
    return NextResponse.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Log sponsor interaction error:', error);
  }
}
