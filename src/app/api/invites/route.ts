export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

// Role hierarchy: who can invite whom
const INVITE_RULES: Record<string, string[]> = {
  'President': ['Vice President'],
  'Vice President': ['Director'],
  'Director': ['Deputy Director', 'Member'],
};

// Role limits per scope
const ROLE_LIMITS: Record<string, number> = {
  'President': 1,       // 1 per society
  'Vice President': 1,  // 1 per wing
  'Director': 1,        // 1 per portfolio
  'Deputy Director': 2, // max 2 per portfolio
};

// POST /api/invites — create invite token
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { societyId, wingId, portfolioId, roleName, email } = await req.json();

    if (!societyId || !roleName || !email) {
      return NextResponse.json({ error: 'societyId, roleName, and email are required' }, { status: 400 });
    }

    // Get inviter's role in this society
    const myMembership = await query(
      `SELECT r.name FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
       ORDER BY r.hierarchy_level DESC LIMIT 1`,
      [user.userId, societyId]
    );

    const myRole = user.userType === 'SUPER_ADMIN' ? 'President' : myMembership.rows[0]?.name;
    if (!myRole) {
      return NextResponse.json({ error: 'You are not a member of this society' }, { status: 403 });
    }

    // Check invite permission
    const canInvite = INVITE_RULES[myRole];
    if (!canInvite || !canInvite.includes(roleName)) {
      return NextResponse.json(
        { error: `${myRole} cannot invite ${roleName}. Allowed: ${canInvite?.join(', ') || 'none'}` },
        { status: 403 }
      );
    }

    // VP must be invited to a specific wing
    if (roleName === 'Vice President' && !wingId) {
      return NextResponse.json({ error: 'Wing must be specified for VP invite' }, { status: 400 });
    }
    // Director / Deputy Director / Member must have portfolio (except Member which is wing-level)
    if (['Director', 'Deputy Director'].includes(roleName) && !portfolioId) {
      return NextResponse.json({ error: 'Portfolio must be specified for Director/Deputy Director invite' }, { status: 400 });
    }

    // Check role limits
    const limit = ROLE_LIMITS[roleName];
    if (limit) {
      let countQuery = '';
      let countParams: (string | null)[] = [];

      if (roleName === 'President') {
        countQuery = `SELECT COUNT(*) c FROM society_memberships sm
          JOIN roles r ON sm.role_id = r.id
          WHERE sm.society_id = $1 AND r.name = 'President' AND sm.is_active = TRUE`;
        countParams = [societyId];
      } else if (roleName === 'Vice President') {
        countQuery = `SELECT COUNT(*) c FROM society_memberships sm
          JOIN roles r ON sm.role_id = r.id
          WHERE sm.society_id = $1 AND sm.wing_id = $2 AND r.name = 'Vice President' AND sm.is_active = TRUE`;
        countParams = [societyId, wingId];
      } else if (roleName === 'Director') {
        countQuery = `SELECT COUNT(*) c FROM society_memberships sm
          JOIN roles r ON sm.role_id = r.id
          WHERE sm.society_id = $1 AND sm.portfolio_id = $2 AND r.name = 'Director' AND sm.is_active = TRUE`;
        countParams = [societyId, portfolioId];
      } else if (roleName === 'Deputy Director') {
        countQuery = `SELECT COUNT(*) c FROM society_memberships sm
          JOIN roles r ON sm.role_id = r.id
          WHERE sm.society_id = $1 AND sm.portfolio_id = $2 AND r.name = 'Deputy Director' AND sm.is_active = TRUE`;
        countParams = [societyId, portfolioId];
      }

      if (countQuery) {
        const currentCount = await query(countQuery, countParams);
        if (parseInt(currentCount.rows[0].c) >= limit) {
          return NextResponse.json(
            { error: `Role limit reached: max ${limit} ${roleName}(s) allowed in this scope` },
            { status: 409 }
          );
        }
      }

      // Also count pending invites towards the limit
      let pendingQuery = `SELECT COUNT(*) c FROM invite_tokens
        WHERE society_id = $1 AND role_name = $2 AND status = 'PENDING'`;
      const pendingParams: (string | null)[] = [societyId, roleName];

      if (wingId) {
        pendingQuery += ` AND wing_id = $${pendingParams.length + 1}`;
        pendingParams.push(wingId);
      }
      if (portfolioId) {
        pendingQuery += ` AND portfolio_id = $${pendingParams.length + 1}`;
        pendingParams.push(portfolioId);
      }

      const pendingCount = await query(pendingQuery, pendingParams);
      const countResult = countQuery ? (await query(countQuery, countParams)) : { rows: [{ c: '0' }] };
      const total = parseInt(countResult.rows[0].c) + parseInt(pendingCount.rows[0].c);
      if (total >= limit) {
        return NextResponse.json(
          { error: `Role limit reached (including pending invites): max ${limit} ${roleName}(s)` },
          { status: 409 }
        );
      }
    }

    // Check if email already has this role
    const existingMembership = await query(
      `SELECT sm.id FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       JOIN users u ON sm.user_id = u.id
       WHERE u.email = $1 AND sm.society_id = $2 AND r.name = $3 AND sm.is_active = TRUE`,
      [email, societyId, roleName]
    );
    if (existingMembership.rows.length > 0) {
      return NextResponse.json({ error: 'User already has this role' }, { status: 409 });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `INSERT INTO invite_tokens (token, society_id, wing_id, portfolio_id, role_name, invited_email, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [token, societyId, wingId || null, portfolioId || null, roleName, email, user.userId, expiresAt]
    );

    return NextResponse.json({
      token,
      inviteLink: `/invite?token=${token}`,
      roleName,
      email,
      expiresAt: expiresAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Invite create error:', error);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }
}

// GET /api/invites?societyId=xxx — list invites for a society
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const societyId = req.nextUrl.searchParams.get('societyId');
    if (!societyId) return NextResponse.json({ error: 'societyId required' }, { status: 400 });

    const result = await query(
      `SELECT it.id, it.token, it.role_name, it.invited_email, it.status,
              it.wing_id, it.portfolio_id, it.expires_at, it.created_at,
              u.full_name AS invited_by_name,
              w.name AS wing_name, p.name AS portfolio_name
       FROM invite_tokens it
       JOIN users u ON it.invited_by = u.id
       LEFT JOIN wings w ON it.wing_id = w.id
       LEFT JOIN portfolios p ON it.portfolio_id = p.id
       WHERE it.society_id = $1
       ORDER BY it.created_at DESC`,
      [societyId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Invites fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
