export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/admin/societies?status=PENDING
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status');

    let q = `SELECT s.id, s.name, s.description, s.logo_url,
                    COALESCE(ns.abbreviation, CASE WHEN s.is_nust_wide THEN 'NUST-Wide' ELSE NULL END) AS category,
                    s.status, s.created_at, s.president_name, s.contact_number,
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
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Admin societies error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
