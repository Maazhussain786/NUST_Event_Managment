export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/governance/ticket-approvals — list tickets with optional status filter
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Verify membership with hierarchy >= 3 (Deputy Director+) or super admin
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }
    const level = membership.rows[0]?.hierarchy_level || (user.userType === 'SUPER_ADMIN' ? 10 : 0);
    if (level < 3) {
      return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    // Get tickets with payment proofs for events belonging to this society
    let sql = `
      SELECT t.id, t.event_id, t.user_id, t.status, t.purchased_at, t.created_at,
             e.title AS event_title, e.ticket_price,
             u.full_name AS buyer_name, u.email AS buyer_email, u.avatar_url AS buyer_avatar,
             pp.id AS proof_id, pp.proof_url, pp.proof_type, pp.status AS proof_status,
             pp.rejection_reason
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN users u ON t.user_id = u.id
      LEFT JOIN payment_proofs pp ON t.id = pp.ticket_id
      WHERE e.society_id = $1
    `;
    const qParams: unknown[] = [societyId];

    if (status && status !== 'ALL') {
      qParams.push(status);
      sql += ` AND t.status = $${qParams.length}`;
    }

    sql += ` ORDER BY t.created_at DESC`;

    const result = await query(sql, qParams);

    // Get stats
    const stats = await query(
      `SELECT
         COUNT(CASE WHEN t.status = 'PENDING' THEN 1 END) AS pending,
         COUNT(CASE WHEN t.status = 'APPROVED' THEN 1 END) AS approved,
         COUNT(CASE WHEN t.status = 'REJECTED' THEN 1 END) AS rejected
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       WHERE e.society_id = $1`,
      [societyId]
    );

    return NextResponse.json({
      tickets: result.rows,
      stats: stats.rows[0],
    });
  } catch (error) {
    console.error('Ticket approvals error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
