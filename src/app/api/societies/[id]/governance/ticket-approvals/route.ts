export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requireSocietyPrivilege } from "@/lib/rbac";
import { CONTAINERS, resolveMediaFields } from '@/lib/blob';

// GET /api/societies/[id]/governance/ticket-approvals — list tickets with optional status filter
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    const access = await requireSocietyPrivilege(user, societyId, "VERIFY_PAYMENTS");
    if (access instanceof NextResponse) return access;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    // Get tickets with payment proofs for events belonging to this society.
    // Return data in PendingTicket shape expected by src/app/society/types.ts.
    const displayStatusExpr = `
      CASE
        WHEN t.status = 'PENDING' AND pp.status = 'REJECTED' THEN 'NEEDS_REUPLOAD'
        WHEN t.status = 'PENDING' AND pp.proof_url IS NULL THEN 'PENDING_VERIFICATION'
        ELSE t.status::TEXT
      END
    `;

    const proofMetaCols = await query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'payment_proofs'
         AND column_name IN ('transaction_reference', 'student_note')`
    );
    const hasProofMetaCols = proofMetaCols.rows.length >= 2;

    const transactionRefExprOuter = hasProofMetaCols
      ? 'pp.transaction_reference'
      : `''::TEXT`;
    const studentNoteExprOuter = hasProofMetaCols
      ? 'pp.student_note'
      : 'NULL::TEXT';
    const transactionRefExprInner = hasProofMetaCols
      ? 'transaction_reference'
      : `''::TEXT`;
    const studentNoteExprInner = hasProofMetaCols
      ? 'student_note'
      : 'NULL::TEXT';

    let sql = `
      SELECT
        t.id,
        t.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        u.avatar_url AS user_avatar,
        t.event_id,
        e.title AS event_title,
        COALESCE(e.ticket_price, 0)::TEXT AS amount,
        COALESCE(t.payment_reference::TEXT, '') AS payment_reference,
        pp.proof_url AS payment_proof_url,
        pp.proof_type,
        ${transactionRefExprOuter} AS transaction_reference,
        ${studentNoteExprOuter} AS student_note,
        pp.created_at AS proof_submitted_at,
        pp.status AS payment_proof_status,
        ${displayStatusExpr} AS status,
        t.purchased_at,
        pp.verified_at AS reviewed_at,
        reviewer.full_name AS reviewed_by_name,
        pp.rejection_reason
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN users u ON t.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT
          id,
          proof_url,
          proof_type,
          status,
          verified_by,
          verified_at,
          rejection_reason,
          created_at,
          updated_at,
          ${transactionRefExprInner} AS transaction_reference,
          ${studentNoteExprInner} AS student_note
        FROM payment_proofs
        WHERE ticket_id = t.id
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      ) pp ON TRUE
      LEFT JOIN users reviewer ON reviewer.id = pp.verified_by
      WHERE e.society_id = $1
    `;
    const qParams: unknown[] = [societyId];

    if (status && status !== 'ALL') {
      qParams.push(status);
      sql += ` AND ${displayStatusExpr} = $${qParams.length}`;
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

    const tickets = result.rows.map((row) =>
      resolveMediaFields(
        row,
        {
          payment_proof_url: CONTAINERS.EVENT_MEDIA,
          user_avatar: CONTAINERS.PROFILE_PICTURES,
        },
        24 * 60,
      ),
    );

    return NextResponse.json({
      tickets,
      stats: {
        pending: Number(stats.rows[0].pending || 0),
        approved: Number(stats.rows[0].approved || 0),
        rejected: Number(stats.rows[0].rejected || 0),
      },
    });
  } catch (error) {
    console.error('Ticket approvals error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
