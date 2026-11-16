export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog, checkApiRateLimit } from '@/lib/api-utils';
import { getSocietyAccess, can, forbidden } from '@/lib/rbac';
import { normalizeEmail, isAllowedNustEmail, NUST_ONLY_ERROR_MESSAGE } from '@/lib/email-policy';
import { sendEmail, appBaseUrl } from '@/lib/email';

/**
 * POST /api/invites — invite someone (by email) into a society role.
 *   Member roles          need MANAGE_MEMBERS
 *   Officer / Admin roles need MANAGE_ROLES and must rank below the inviter
 * The President changes through transfer-presidency and the Faculty Sponsor is
 * assigned by a platform administrator, so neither can be invited here.
 * Team Lead / Executive places are per event: use the event Teams screen.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const limited = checkApiRateLimit(user.userId, 'invite-create', 20);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const societyId = String(body.societyId || '');
    const wingId: string | null = body.wingId || null;
    const roleName = String(body.roleName || '').trim();
    const email = normalizeEmail(body.email || body.invitedEmail);

    if (!societyId || !roleName || !email) return ApiErrors.validation('societyId, roleName, and email are required');
    if (!isAllowedNustEmail(email)) return ApiErrors.validation(NUST_ONLY_ERROR_MESSAGE);

    const access = await getSocietyAccess(user, societyId);
    if (!access) return ApiErrors.notFound('Society');

    const roleResult = await query(
      'SELECT id, name, tier, hierarchy_level, max_holders FROM roles WHERE society_id = $1 AND name = $2',
      [societyId, roleName],
    );
    const role = roleResult.rows[0];
    if (!role) return ApiErrors.validation('Unknown role for this society');
    if (role.name === 'President') return forbidden('Use "Transfer presidency" to change the President.');
    if (role.tier === 'FACULTY_SPONSOR') return forbidden('The Faculty Sponsor is assigned by platform administrators.');

    const needed = role.tier === 'MEMBER' ? 'MANAGE_MEMBERS' : 'MANAGE_ROLES';
    if (!can(access, needed)) return forbidden('You do not have permission to invite people to this role.');
    if (!access.isSuperAdmin && role.hierarchy_level >= access.level) {
      return forbidden('You can only invite people to roles ranked below your own.');
    }

    if (wingId) {
      if (role.tier !== 'OFFICER') return ApiErrors.validation('Only Officer roles can be tied to a wing.');
      const wing = await query('SELECT 1 FROM wings WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL', [wingId, societyId]);
      if (wing.rows.length === 0) return ApiErrors.validation('Invalid wing for this society');
    }

    if (role.max_holders) {
      const counts = await query(
        `SELECT
           (SELECT COUNT(*) FROM society_memberships WHERE society_id = $1 AND role_id = $2 AND is_active)::int +
           (SELECT COUNT(*) FROM invite_tokens WHERE society_id = $1 AND role_name = $3 AND status = 'PENDING' AND expires_at > NOW())::int
           AS total`,
        [societyId, role.id, role.name],
      );
      if (counts.rows[0].total >= role.max_holders) {
        return ApiErrors.conflict(`${role.name} is limited to ${role.max_holders} (including pending invites).`);
      }
    }

    const existingActive = await query(
      `SELECT 1 FROM society_memberships sm JOIN users u ON sm.user_id = u.id
       WHERE u.email = $1 AND sm.society_id = $2 AND sm.is_active LIMIT 1`,
      [email, societyId],
    );
    if (existingActive.rows.length > 0) {
      return ApiErrors.conflict('This person is already a member. Use "Change role" instead.');
    }
    const existingPending = await query(
      `SELECT 1 FROM invite_tokens
       WHERE society_id = $1 AND invited_email = $2 AND status = 'PENDING' AND expires_at > NOW() LIMIT 1`,
      [societyId, email],
    );
    if (existingPending.rows.length > 0) return ApiErrors.conflict('This person already has a pending invite.');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inserted = await query(
      `INSERT INTO invite_tokens (token, society_id, wing_id, portfolio_id, role_name, invited_email, invited_by, expires_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7) RETURNING id`,
      [token, societyId, wingId, role.name, email, user.userId, expiresAt],
    );

    const society = await query('SELECT name FROM societies WHERE id = $1', [societyId]);
    const inviteLink = `/invite?token=${token}`;
    await sendEmail({
      to: email,
      subject: `Invitation: ${role.name} at ${society.rows[0]?.name ?? 'a society'}`,
      text:
        `${user.fullName} invited you to join ${society.rows[0]?.name ?? 'their society'} as ${role.name}.\n\n` +
        `Accept the invitation (valid for 7 days):\n${appBaseUrl()}${inviteLink}\n\n` +
        'Sign in or create an account with this email address to accept.',
    });
    await writeAuditLog({
      action: 'INVITE_CREATED',
      performedBy: user.userId,
      societyId,
      targetType: 'invite_token',
      targetId: inserted.rows[0].id,
      newValue: { role: role.name, email, wingId },
    });

    return NextResponse.json({ token, inviteLink, roleName: role.name, email, expiresAt: expiresAt.toISOString() }, { status: 201 });
  } catch (error) {
    return ApiErrors.serverError('Invite create error:', error);
  }
}

// GET /api/invites?societyId=xxx — invites of a society (MANAGE_MEMBERS or MANAGE_ROLES)
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const societyId = req.nextUrl.searchParams.get('societyId');
    if (!societyId) return ApiErrors.validation('societyId required');

    const access = await getSocietyAccess(user, societyId);
    if (!access) return ApiErrors.notFound('Society');
    if (!can(access, 'MANAGE_MEMBERS') && !can(access, 'MANAGE_ROLES')) return forbidden('You cannot view invites.');

    const result = await query(
      `SELECT it.id, it.token, it.role_name, it.invited_email, it.status,
              it.wing_id, it.portfolio_id, it.expires_at, it.created_at,
              u.full_name AS invited_by_name, w.name AS wing_name, p.name AS portfolio_name
       FROM invite_tokens it
       JOIN users u ON it.invited_by = u.id
       LEFT JOIN wings w ON it.wing_id = w.id
       LEFT JOIN portfolios p ON it.portfolio_id = p.id
       WHERE it.society_id = $1
       ORDER BY it.created_at DESC`,
      [societyId],
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    return ApiErrors.serverError('Invites fetch error:', error);
  }
}
