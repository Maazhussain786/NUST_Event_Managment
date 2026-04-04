export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUser, generateToken, setAuthCookie } from '@/lib/auth';
import { query } from '@/lib/db';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';
import { shouldReturnAuthToken } from '@/lib/auth-response';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getCurrentUser();
    if (!authUser) {
      const res = NextResponse.json({ authenticated: false }, { status: 401 });
      res.cookies.delete('auth_token');
      return res;
    }

    const userResult = await query(
      'SELECT id, email, full_name, user_type, status, avatar_url FROM users WHERE id = $1 LIMIT 1',
      [authUser.userId]
    );

    if (userResult.rows.length === 0) {
      const res = NextResponse.json({ authenticated: false }, { status: 401 });
      res.cookies.delete('auth_token');
      return res;
    }

    const user = userResult.rows[0];
    if (user.status === 'SUSPENDED') {
      const res = NextResponse.json({ error: 'Account suspended' }, { status: 403 });
      res.cookies.delete('auth_token');
      return res;
    }

    // Activity heartbeat used by admin dashboard "Last Active".
    // Throttle writes to avoid updating on every request burst.
    await query(
      `UPDATE users
       SET updated_at = NOW()
       WHERE id = $1
         AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '5 minutes')`,
      [user.id]
    );

    let avatarUrl: string | null = null;
    if (user.avatar_url) {
      try {
        avatarUrl = resolveMediaUrl(user.avatar_url, {
          container: CONTAINERS.PROFILE_PICTURES,
          expiresInMinutes: 60 * 24,
        });
      } catch {
        avatarUrl = null;
      }
    }

    // Sliding session refresh: re-issue JWT on successful validation.
    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: user.user_type,
      fullName: user.full_name,
    });

    const includeToken = shouldReturnAuthToken(req);
    const responseBody: {
      authenticated: true;
      user: {
        id: string;
        email: string;
        fullName: string;
        userType: 'SUPER_ADMIN' | 'STUDENT';
        avatarUrl: string | null;
      };
      token?: string;
    } = {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        userType: user.user_type,
        avatarUrl,
      },
    };
    if (includeToken) {
      responseBody.token = token;
    }

    const res = NextResponse.json(responseBody);
    setAuthCookie(res, token);
    return res;
  } catch (error) {
    console.error('Session validation error:', error);
    return NextResponse.json({ error: 'Failed to validate session' }, { status: 500 });
  }
}
