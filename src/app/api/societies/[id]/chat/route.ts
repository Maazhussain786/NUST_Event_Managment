export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/chat — list chat channels
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Verify membership
    const membership = await query(
      `SELECT sm.id, r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const result = await query(
      `SELECT c.id, c.society_id, c.wing_id, c.portfolio_id, c.name,
              c.description, c.mode, c.is_active, c.created_by, c.created_at,
              COUNT(cm.id) AS message_count,
              MAX(cm.created_at) AS last_message_at,
              w.name AS wing_name, p.name AS portfolio_name
       FROM chats c
       LEFT JOIN chat_messages cm ON cm.chat_id = c.id AND cm.is_deleted = FALSE
       LEFT JOIN wings w ON c.wing_id = w.id
       LEFT JOIN portfolios p ON c.portfolio_id = p.id
       WHERE c.society_id = $1 AND c.is_active = TRUE
       GROUP BY c.id, w.name, p.name
       ORDER BY MAX(cm.created_at) DESC NULLS LAST, c.created_at DESC`,
      [societyId]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Fetch chat channels error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/societies/[id]/chat — create a chat channel
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Check permission (chat_management_role from settings)
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const level = user.userType === 'SUPER_ADMIN' ? 99 : membership.rows[0].hierarchy_level;

    // Get minimum level for chat management from settings
    const settings = await query(
      `SELECT chat_management_role FROM society_settings WHERE society_id = $1`,
      [societyId]
    );
    const roleLevels: Record<string, number> = {
      'President': 10, 'Vice President': 8, 'Director': 5, 'Deputy Director': 3, 'Member': 1
    };
    const minLevel = roleLevels[settings.rows[0]?.chat_management_role || 'Vice President'] || 8;

    if (level < minLevel) {
      return NextResponse.json({ error: 'Insufficient permissions to create channels' }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, wing_id, portfolio_id, mode = 'OPEN' } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO chats (society_id, wing_id, portfolio_id, name, description, mode, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [societyId, wing_id || null, portfolio_id || null, name.trim(), description || null, mode, user.userId]
    );

    return NextResponse.json({ success: true, channel: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Create chat channel error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
