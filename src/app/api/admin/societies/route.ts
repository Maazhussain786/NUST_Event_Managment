export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTAINERS, resolveMediaFields } from '@/lib/blob';
import { ensureNustAdministrationSociety } from '@/lib/nustAdministrationSociety';

// GET /api/admin/societies?status=PENDING
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ensureNustAdministrationSociety(user.userId);

    const status = req.nextUrl.searchParams.get('status');

    let q = `SELECT s.id, s.name, s.description, s.logo_url,
                    COALESCE(ns.abbreviation, CASE WHEN s.is_nust_wide THEN 'NUST-Wide' ELSE NULL END) AS category,
                    s.status, s.created_at, s.president_name, s.contact_number,
                    s.faculty_advisor_name, s.justification, s.admin_message, s.contact_email, s.faculty_sponsor_email,
                    (SELECT fu.full_name FROM society_memberships fsm JOIN roles fr ON fr.id = fsm.role_id JOIN users fu ON fu.id = fsm.user_id
                     WHERE fsm.society_id = s.id AND fsm.is_active AND fr.tier = 'FACULTY_SPONSOR' LIMIT 1) AS faculty_sponsor_name,
                    u.full_name AS created_by_name, u.email AS created_by_email,
                    COUNT(DISTINCT sm.user_id) as member_count,
                    COUNT(DISTINCT e.id) as event_count,
                    ss.storage_used_bytes,
                    COALESCE(ss.storage_quota_bytes, 524288000) AS storage_quota_bytes
             FROM societies s
             LEFT JOIN nust_schools ns ON s.school_id = ns.id
             LEFT JOIN users u ON s.created_by = u.id
             LEFT JOIN society_memberships sm ON sm.society_id = s.id AND sm.is_active = TRUE
             LEFT JOIN events e ON e.society_id = s.id
             LEFT JOIN society_settings ss ON ss.society_id = s.id`;

    const params: string[] = [];
    if (status) {
      q += ' WHERE s.status = $1';
      params.push(status);
    }

    q += ' GROUP BY s.id, ns.abbreviation, u.full_name, u.email, ss.storage_used_bytes, ss.storage_quota_bytes ORDER BY s.created_at DESC';

    const result = await query(q, params);
    const societies = result.rows.map((row) =>
      resolveMediaFields(row, {
        logo_url: CONTAINERS.SOCIETY_MEDIA,
      }),
    );

    return NextResponse.json(societies);
  } catch (error) {
    console.error('Admin societies error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
