export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { forbidden } from '@/lib/rbac';
import { getSponsorAccess } from '@/lib/sponsors';
import { cleanText } from '@/lib/event-workspace';
import { isValidEmailFormat, normalizeEmail } from '@/lib/email-policy';

// GET /api/societies/[id]/sponsors — sponsor directory with deal totals (FR-SPN-01)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getSponsorAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canView) return forbidden('You cannot view sponsors.');

    const result = await query(
      `SELECT s.id, s.name, s.industry, s.contact_name, s.contact_email, s.contact_phone, s.website, s.notes,
              s.created_at, s.updated_at,
              COALESCE(SUM(sp.amount) FILTER (WHERE sp.status IN ('CONFIRMED', 'RECEIVED')), 0) AS committed_total,
              COALESCE(SUM(sp.amount) FILTER (WHERE sp.status = 'RECEIVED'), 0) AS received_total,
              COUNT(sp.id)::int AS deal_count,
              (SELECT MAX(i.occurred_on) FROM sponsor_interactions i WHERE i.sponsor_id = s.id) AS last_contact
       FROM sponsors s
       LEFT JOIN sponsorships sp ON sp.sponsor_id = s.id
       WHERE s.society_id = $1 AND s.deleted_at IS NULL
       GROUP BY s.id
       ORDER BY s.name`,
      [params.id],
    );
    return NextResponse.json({ sponsors: result.rows, can_manage: access.canManage });
  } catch (error) {
    return ApiErrors.serverError('Sponsors list error:', error);
  }
}

// POST /api/societies/[id]/sponsors — add a sponsor to the directory
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await getSponsorAccess(user, params.id);
    if (!access) return ApiErrors.notFound('Society');
    if (!access.canManage) return forbidden('Only Outreach/Sponsors or Admins can add sponsors.');

    const body = await req.json().catch(() => ({}));
    const name = cleanText(body.name, 200);
    if (!name) return ApiErrors.validation('Sponsor name is required');
    const email = body.contact_email ? normalizeEmail(body.contact_email) : null;
    if (email && !isValidEmailFormat(email)) return ApiErrors.validation('Invalid contact email');
    const website = cleanText(body.website, 300);
    if (website && !/^https?:\/\//i.test(website)) return ApiErrors.validation('Website must start with http(s)://');

    const inserted = await query(
      `INSERT INTO sponsors (society_id, name, industry, contact_name, contact_email, contact_phone, website, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [params.id, name, cleanText(body.industry, 120), cleanText(body.contact_name, 200), email,
        cleanText(body.contact_phone, 40), website, cleanText(body.notes, 4000), user.userId],
    );
    await writeAuditLog({
      action: 'SPONSOR_ADDED',
      performedBy: user.userId,
      societyId: params.id,
      targetType: 'sponsor',
      targetId: inserted.rows[0].id,
      newValue: { name },
    });
    return NextResponse.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return ApiErrors.conflict('A sponsor with this name already exists');
    return ApiErrors.serverError('Add sponsor error:', error);
  }
}
