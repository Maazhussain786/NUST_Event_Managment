export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/societies/[id]/settings — get society settings
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;

    // Check user is a member of this society
    const membership = await query(
      `SELECT r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, id]
    );
    if (membership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const result = await query(
      `SELECT * FROM society_settings WHERE society_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return NextResponse.json({
        society_id: id,
        event_creation_role: 'Director',
        chat_management_role: 'Vice President',
        content_upload_role: 'Deputy Director',
        ticketing_enabled: true,
        transfer_policy: 'ALLOWED',
        transfer_deadline_hours: 24
      });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PATCH /api/societies/[id]/settings — update society settings (President only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;

    // Check user is President or Super Admin
    const membership = await query(
      `SELECT r.name, r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, id]
    );
    const isPresident = membership.rows.some((m: any) => m.name === 'President');
    if (!isPresident && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only the President can update settings' }, { status: 403 });
    }

    const body = await request.json();
    const {
      event_creation_role,
      chat_management_role,
      content_upload_role,
      ticketing_enabled,
      transfer_policy,
      transfer_deadline_hours
    } = body;

    const validRoles = ['President', 'Vice President', 'Director', 'Deputy Director', 'Member'];
    if (event_creation_role && !validRoles.includes(event_creation_role)) {
      return NextResponse.json({ error: 'Invalid event_creation_role' }, { status: 400 });
    }
    if (chat_management_role && !validRoles.includes(chat_management_role)) {
      return NextResponse.json({ error: 'Invalid chat_management_role' }, { status: 400 });
    }

    const validPolicies = ['ALLOWED', 'RESTRICTED', 'DISABLED'];
    if (transfer_policy && !validPolicies.includes(transfer_policy)) {
      return NextResponse.json({ error: 'Invalid transfer_policy' }, { status: 400 });
    }

    // Upsert settings
    const result = await query(
      `INSERT INTO society_settings (society_id, event_creation_role, chat_management_role, content_upload_role, ticketing_enabled, transfer_policy, transfer_deadline_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (society_id) DO UPDATE SET
         event_creation_role = COALESCE($2, society_settings.event_creation_role),
         chat_management_role = COALESCE($3, society_settings.chat_management_role),
         content_upload_role = COALESCE($4, society_settings.content_upload_role),
         ticketing_enabled = COALESCE($5, society_settings.ticketing_enabled),
         transfer_policy = COALESCE($6, society_settings.transfer_policy),
         transfer_deadline_hours = COALESCE($7, society_settings.transfer_deadline_hours),
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        event_creation_role || 'Director',
        chat_management_role || 'Vice President',
        content_upload_role || 'Deputy Director',
        ticketing_enabled ?? true,
        transfer_policy || 'ALLOWED',
        transfer_deadline_hours || 24
      ]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
