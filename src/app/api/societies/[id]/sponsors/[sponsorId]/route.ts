export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden } from '@/lib/rbac';
import { getSponsorAccess } from '@/lib/sponsors';
import { cleanText, isUuid } from '@/lib/event-workspace';
import { isValidEmailFormat, normalizeEmail } from '@/lib/email-policy';

async function loadSponsor(societyId: string, sponsorId: string) {
  if (!isUuid(sponsorId)) return null;
  const r = await query('SELECT * FROM sponsors WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL', [sponsorId, societyId]);
  return r.rows[0] ?? null;
}

// GET /api/societies/[id]/sponsors/[sponsorId] — sponsor with full history (FR-SPN-01/02)
export async function GET(req: NextRequest, { params }: { params: { id: string; sponsorId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getSponsorAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canView) return forbidden('You cannot view sponsors.');
    const sponsor = await loadSponsor(params.id, params.sponsorId);
    if (!sponsor) return ApiErrors.notFound('Sponsor');

    const [interactions, deals] = await Promise.all([
      query(
        `SELECT i.id, i.interaction_type, i.summary, i.occurred_on, i.created_at, i.event_id, e.title AS event_title,
                u.full_name AS logged_by_name
         FROM sponsor_interactions i JOIN users u ON u.id = i.logged_by LEFT JOIN events e ON e.id = i.event_id
         WHERE i.sponsor_id = $1 ORDER BY i.occurred_on DESC, i.created_at DESC`,
        [sponsor.id],
      ),
      query(
        `SELECT s.id, s.event_id, e.title AS event_title, s.amount, s.status, s.deliverables, s.deliverables_status,
                s.received_on, s.verified_at, s.created_at
         FROM sponsorships s JOIN events e ON e.id = s.event_id
         WHERE s.sponsor_id = $1 ORDER BY s.created_at DESC`,
        [sponsor.id],
      ),
    ]);
    return NextResponse.json({ sponsor, interactions: interactions.rows, deals: deals.rows, can_manage: access.canManage });
  } catch (error) {
    return ApiErrors.serverError('Sponsor detail error:', error);
  }
}

// PATCH /api/societies/[id]/sponsors/[sponsorId] — edit directory details
export async function PATCH(req: NextRequest, { params }: { params: { id: string; sponsorId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getSponsorAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canManage) return forbidden('Only Outreach/Sponsors or Admins can edit sponsors.');
    const sponsor = await loadSponsor(params.id, params.sponsorId);
    if (!sponsor) return ApiErrors.notFound('Sponsor');

    const body = await req.json().catch(() => ({}));
    const pick = (key: string, max: number) => (body[key] !== undefined ? cleanText(body[key], max) : sponsor[key]);
    const name = pick('name', 200);
    if (!name) return ApiErrors.validation('Sponsor name is required');
    const email = body.contact_email !== undefined ? (body.contact_email ? normalizeEmail(body.contact_email) : null) : sponsor.contact_email;
    if (email && !isValidEmailFormat(email)) return ApiErrors.validation('Invalid contact email');
    const website = pick('website', 300);
    if (website && !/^https?:\/\//i.test(website)) return ApiErrors.validation('Website must start with http(s)://');

    await query(
      `UPDATE sponsors SET name = $2, industry = $3, contact_name = $4, contact_email = $5, contact_phone = $6,
              website = $7, notes = $8, updated_at = NOW()
       WHERE id = $1`,
      [sponsor.id, name, pick('industry', 120), pick('contact_name', 200), email, pick('contact_phone', 40), website, pick('notes', 4000)],
    );
    await writeAuditLog({
      action: 'SPONSOR_UPDATED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'sponsor',
      targetId: sponsor.id,
      oldValue: { name: sponsor.name, contact_email: sponsor.contact_email },
      newValue: { name, contact_email: email },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return ApiErrors.conflict('A sponsor with this name already exists');
    return ApiErrors.serverError('Update sponsor error:', error);
  }
}
