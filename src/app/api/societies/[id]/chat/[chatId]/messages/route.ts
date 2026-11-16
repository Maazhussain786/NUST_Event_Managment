export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTAINERS, resolveMediaFields } from '@/lib/blob';
import { requireSocietyMember, forbidden } from '@/lib/rbac';
import { canViewChat, sendBlockReason, type ChatRow } from '@/lib/chat-access';
import { ApiErrors, checkApiRateLimit } from '@/lib/api-utils';

async function loadChat(chatId: string, societyId: string): Promise<ChatRow | null> {
  const chat = await query(
    `SELECT id, society_id, wing_id, portfolio_id, mode, is_active
     FROM chats WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL`,
    [chatId, societyId],
  );
  return chat.rows[0] ?? null;
}

// GET /api/societies/[id]/chat/[chatId]/messages — fetch messages
export async function GET(req: NextRequest, { params }: { params: { id: string; chatId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const { id: societyId, chatId } = params;

    const access = await requireSocietyMember(user, societyId);
    if (access instanceof NextResponse) return access;
    const chat = await loadChat(chatId, societyId);
    if (!chat) return ApiErrors.notFound('Channel');
    if (!(await canViewChat(access, chat))) return forbidden('You cannot access this channel.');

    const before = req.nextUrl.searchParams.get('before');
    if (before && Number.isNaN(Date.parse(before))) return ApiErrors.validation('Invalid "before" timestamp');
    const limit = 50;

    const queryParams: (string | number)[] = [chatId];
    let sql = `
      SELECT cm.id, cm.chat_id, cm.sender_id, u.full_name AS sender_name,
             u.avatar_url AS sender_avatar, cm.content, cm.reply_to_id,
             cm.is_deleted, cm.created_at
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.chat_id = $1`;
    if (before) {
      queryParams.push(before);
      sql += ` AND cm.created_at < $2`;
    }
    queryParams.push(limit + 1);
    sql += ` ORDER BY cm.created_at DESC LIMIT $${queryParams.length}`;

    const result = await query(sql, queryParams);
    const hasMore = result.rows.length > limit;
    const messages = result.rows
      .slice(0, limit)
      .reverse()
      .map((message) => resolveMediaFields(message, { sender_avatar: CONTAINERS.PROFILE_PICTURES }));

    return NextResponse.json({ messages, hasMore, canSend: (await sendBlockReason(access, chat)) === null });
  } catch (error) {
    return ApiErrors.serverError('Fetch messages error:', error);
  }
}

// POST /api/societies/[id]/chat/[chatId]/messages — send a message
export async function POST(req: NextRequest, { params }: { params: { id: string; chatId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const { id: societyId, chatId } = params;

    const limited = checkApiRateLimit(user.userId, 'chat-send', 30);
    if (limited) return limited;

    const access = await requireSocietyMember(user, societyId);
    if (access instanceof NextResponse) return access;
    const chat = await loadChat(chatId, societyId);
    if (!chat) return ApiErrors.notFound('Channel');

    const blocked = await sendBlockReason(access, chat);
    if (blocked) return forbidden(blocked);

    const body = await req.json().catch(() => ({}));
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return ApiErrors.validation('Message content required');
    if (content.length > 4000) return ApiErrors.validation('Message too long (max 4000 chars)');

    let replyTo: string | null = null;
    if (body.reply_to_id) {
      const parent = await query('SELECT 1 FROM chat_messages WHERE id = $1 AND chat_id = $2', [body.reply_to_id, chatId]);
      if (parent.rows.length === 0) return ApiErrors.validation('Reply target is not in this channel');
      replyTo = body.reply_to_id;
    }

    const result = await query(
      `INSERT INTO chat_messages (chat_id, sender_id, content, reply_to_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, chat_id, sender_id, content, reply_to_id, is_deleted, created_at`,
      [chatId, user.userId, content, replyTo],
    );

    return NextResponse.json(
      { success: true, message: { ...result.rows[0], sender_name: user.fullName, sender_avatar: null } },
      { status: 201 },
    );
  } catch (error) {
    return ApiErrors.serverError('Send message error:', error);
  }
}
