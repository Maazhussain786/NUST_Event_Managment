import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const schoolId = searchParams.get('school');
    const search = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let sql = `
      SELECT s.id, s.name, s.description, s.logo_url, s.status,
             s.is_nust_wide, s.school_id,
             ns.full_name AS school_name, ns.abbreviation AS school_abbr,
             COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count,
             COALESCE(AVG(r.score), 0)::numeric(3,2) AS avg_rating
      FROM societies s
      LEFT JOIN nust_schools ns ON s.school_id = ns.id
      LEFT JOIN society_memberships sm ON s.id = sm.society_id
      LEFT JOIN ratings r ON r.target_type = 'SOCIETY' AND r.target_id = s.id
      WHERE s.status = 'APPROVED'
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (schoolId && schoolId !== 'all') {
      sql += ` AND s.school_id = $${paramIndex}`;
      params.push(schoolId);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` GROUP BY s.id, ns.full_name, ns.abbreviation ORDER BY member_count DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return NextResponse.json({ societies: result.rows, total: result.rows.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch societies';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
