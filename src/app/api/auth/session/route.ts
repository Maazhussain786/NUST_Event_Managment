export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUser, generateToken, setAuthCookie } from '@/lib/auth';
import { query } from '@/lib/db';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';
import { shouldReturnAuthToken } from '@/lib/auth-response';

/**
 * GET /api/auth/session — validate the session and slide its expiry.
 * getCurrentUser() already rejects suspended users and revoked tokens.
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await getCurrentUser();
    if (!authUser) {
      const res = NextResponse.json({ authenticated: false }, { status: 401 });
      res.cookies.delete('auth_token');
      return res;
    }

    const userResult = await query(
      `UPDATE users SET updated_at = NOW()
       WHERE id = $1 AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '5 minutes')
       RETURNING id`,
      [authUser.userId],
    );
    void userResult; // activity heartbeat for the admin "last active" column

    const profile = await query('SELECT avatar_url FROM users WHERE id = $1', [authUser.userId]);
    let avatarUrl: string | null = null;
    if (profile.rows[0]?.avatar_url) {
      try {
        avatarUrl = resolveMediaUrl(profile.rows[0].avatar_url, {
          container: CONTAINERS.PROFILE_PICTURES,
          expiresInMinutes: 60 * 24,
        });
      } catch {
        avatarUrl = null;
      }
    }

    const token = generateToken(authUser);
    const res = NextResponse.json({
      authenticated: true,
      user: {
        id: authUser.userId,
        email: authUser.email,
        fullName: authUser.fullName,
        userType: authUser.userType,
        avatarUrl,
      },
      ...(shouldReturnAuthToken(req) ? { token } : {}),
    });
    setAuthCookie(res, token);
    return res;
  } catch (error) {
    console.error('Session validation error:', error);
    return NextResponse.json({ error: 'Failed to validate session' }, { status: 500 });
  }
}
