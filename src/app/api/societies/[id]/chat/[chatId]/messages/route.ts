export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/chat/[chatId]/messages — fetch messages
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; chatId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, chatId } = params;

    // Verify membership
    const membership = await query(
      `SELECT sm.id FROM society_memberships sm
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Verify chat belongs to this society
    const chat = await query(
      `SELECT id FROM chats WHERE id = $1 AND society_id = $2`,
      [chatId, societyId]
    );
    if (chat.rows.length === 0) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    const limit = 50;

    let messagesQuery = `
      SELECT cm.id, cm.chat_id, cm.sender_id, u.full_name AS sender_name,
             u.avatar_url AS sender_avatar, cm.content, cm.reply_to_id,
             cm.is_deleted, cm.created_at
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.chat_id = $1`;
    const queryParams: (string | number)[] = [chatId];

    if (before) {
      messagesQuery += ` AND cm.created_at < $2`;
      queryParams.push(before);
    }

    messagesQuery += ` ORDER BY cm.created_at DESC LIMIT $${queryParams.length + 1}`;
    queryParams.push(limit + 1);

    const result = await query(messagesQuery, queryParams);
    const hasMore = result.rows.length > limit;
    const messages = result.rows.slice(0, limit).reverse();

    return NextResponse.json({ messages, hasMore });
  } catch (error) {
    console.error('Fetch messages error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/societies/[id]/chat/[chatId]/messages — send a message
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; chatId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, chatId } = params;

    // Verify membership
    const membership = await query(
      `SELECT sm.id FROM society_memberships sm
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Verify chat belongs to this society
    const chat = await query(
      `SELECT id, is_active FROM chats WHERE id = $1 AND society_id = $2`,
      [chatId, societyId]
    );
    if (chat.rows.length === 0) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    if (!chat.rows[0].is_active) {
      return NextResponse.json({ error: 'Channel is archived' }, { status: 403 });
    }

    const body = await req.json();
    const { content, reply_to_id } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 });
    }

    if (content.trim().length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO chat_messages (chat_id, sender_id, content, reply_to_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, chat_id, sender_id, content, reply_to_id, is_deleted, created_at`,
      [chatId, user.userId, content.trim(), reply_to_id || null]
    );

    const message = {
      ...result.rows[0],
      sender_name: user.fullName,
      sender_avatar: null,
    };

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
