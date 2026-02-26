export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/blackout-dates — list all blackout periods
 * POST   /api/admin/blackout-dates — create a blackout period
 * DELETE /api/admin/blackout-dates — delete a blackout period (via body { id })
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_blackout_dates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT,
        scope TEXT NOT NULL DEFAULT 'ALL',
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch {
    return false;
  }
  return true;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tableReady = await ensureTable();
    if (!tableReady) return NextResponse.json([]);

    const result = await query(`
      SELECT bd.id, bd.title, bd.start_date, bd.end_date,
             bd.reason, bd.scope,
             u.full_name AS created_by_name,
             bd.created_at
      FROM platform_blackout_dates bd
      LEFT JOIN users u ON u.id = bd.created_by
      ORDER BY bd.start_date ASC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Blackout dates error:', error);
    return NextResponse.json({ error: 'Failed to fetch blackout dates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ensureTable();

    const { title, start_date, end_date, reason, scope } = await req.json();

    if (!title || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'title, start_date, and end_date are required' },
        { status: 400 }
      );
    }

    const validScopes = ['ALL', 'EVENTS', 'REGISTRATIONS'];
    const result = await query(
      `INSERT INTO platform_blackout_dates (title, start_date, end_date, reason, scope, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        title,
        start_date,
        end_date,
        reason || null,
        validScopes.includes(scope) ? scope : 'ALL',
        user.userId,
      ]
    );

    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'BLACKOUT_DATE', $2, $3, $4)`,
      [
        user.userId,
        result.rows[0].id,
        JSON.stringify({ title, start_date, end_date, scope: scope || 'ALL' }),
        JSON.stringify({ createdBy: user.email }),
      ]
    );

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Create blackout date error:', error);
    return NextResponse.json({ error: 'Failed to create blackout date' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await query('DELETE FROM platform_blackout_dates WHERE id = $1', [id]);

    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'BLACKOUT_DATE', $2, $3)`,
      [
        user.userId,
        id,
        JSON.stringify({ action: 'DELETED', deletedBy: user.email }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete blackout date error:', error);
    return NextResponse.json({ error: 'Failed to delete blackout date' }, { status: 500 });
  }
}
