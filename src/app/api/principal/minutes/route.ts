export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors } from '@/lib/api-utils';
import { isPrincipal } from '@/lib/minutes';

// GET /api/principal/minutes — minutes forwarded to the Principal (FR-MIN-04), across societies
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    if (!(await isPrincipal(user.userId))) return ApiErrors.forbidden('This page is for the Principal.');

    const result = await query(
      `SELECT m.id, m.society_id, s.name AS society_name, m.title, m.meeting_date, m.status, e.title AS event_title,
              u.full_name AS author_name,
              (SELECT MAX(created_at) FROM minutes_approval_steps st WHERE st.minutes_id = m.id AND st.action = 'FORWARDED') AS forwarded_at
       FROM minutes_sheets m
       JOIN societies s ON s.id = m.society_id
       JOIN users u ON u.id = m.created_by
       LEFT JOIN events e ON e.id = m.event_id
       WHERE m.deleted_at IS NULL AND m.status IN ('FORWARDED', 'PRINCIPAL_APPROVED', 'PRINCIPAL_REJECTED')
       ORDER BY (m.status = 'FORWARDED') DESC, forwarded_at DESC NULLS LAST
       LIMIT 300`,
    );
    return NextResponse.json({ minutes: result.rows });
  } catch (error) {
    return ApiErrors.serverError('Principal minutes error:', error);
  }
}
