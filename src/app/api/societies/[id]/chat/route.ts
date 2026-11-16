export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requireSocietyMember, can, forbidden } from '@/lib/rbac';
import { managesChat, VISIBLE_CHAT_CONDITION } from '@/lib/chat-access';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';

const MODES = ['OPEN', 'RESTRICTED', 'ANNOUNCEMENT_ONLY'];

// GET /api/societies/[id]/chat — channels the caller can see
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const access = await requireSocietyMember(user, params.id);
    if (access instanceof NextResponse) return access;
    if (!managesChat(access) && !can(access, 'VIEW_CHAT')) return forbidden('You cannot view chats.');

    const scopeFilter = managesChat(access) ? '' : `AND ${VISIBLE_CHAT_CONDITION}`;
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
       WHERE c.society_id = $2 AND c.is_active = TRUE AND c.deleted_at IS NULL ${scopeFilter}
       GROUP BY c.id, w.name, p.name
       ORDER BY MAX(cm.created_at) DESC NULLS LAST, c.created_at DESC`,
      [user.userId, params.id],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    return ApiErrors.serverError('Fetch chat channels error:', error);
  }
}

// POST /api/societies/[id]/chat — create a channel (MANAGE_CHAT)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const societyId = params.id;
    const access = await requireSocietyMember(user, societyId);
    if (access instanceof NextResponse) return access;
    if (!managesChat(access)) return forbidden('You do not have permission to create channels.');

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const mode = body.mode || 'OPEN';
    const wingId = body.wing_id || null;
    const portfolioId = body.portfolio_id || null;

    if (!name) return ApiErrors.validation('Channel name is required');
    if (name.length > 200) return ApiErrors.validation('Channel name is too long');
    if (!MODES.includes(mode)) return ApiErrors.validation('Invalid channel mode');

    if (wingId) {
      const wing = await query('SELECT 1 FROM wings WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL', [wingId, societyId]);
      if (wing.rows.length === 0) return ApiErrors.validation('Wing does not belong to this society');
    }
    let finalWingId = wingId;
    if (portfolioId) {
      const portfolio = await query(
        'SELECT wing_id FROM portfolios WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL',
        [portfolioId, societyId],
      );
      if (portfolio.rows.length === 0) return ApiErrors.validation('Portfolio does not belong to this society');
      finalWingId = portfolio.rows[0].wing_id;
    }

    const result = await query(
      `INSERT INTO chats (society_id, wing_id, portfolio_id, name, description, mode, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [societyId, finalWingId, portfolioId, name, body.description || null, mode, user.userId],
    );

    await writeAuditLog({
      action: 'CHAT_CREATED',
      performedBy: user.userId,
      societyId,
      targetType: 'chat',
      targetId: result.rows[0].id,
      newValue: { name, mode, wingId: finalWingId, portfolioId },
    });

    return NextResponse.json({ success: true, channel: result.rows[0] }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Create chat channel error:', error);
  }
}
