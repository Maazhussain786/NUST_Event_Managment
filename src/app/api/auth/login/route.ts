export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword, generateToken } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors } from '@/lib/api-utils';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';

export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req);
    const rateLimited = checkApiRateLimit(ip || 'unknown', 'login', 10);
    if (rateLimited) return rateLimited;

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const result = await query(
      'SELECT id, email, password_hash, full_name, user_type, status, avatar_url FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = result.rows[0];

    // Check verification status
    if (user.status === 'PENDING_VERIFICATION') {
      return NextResponse.json({ error: 'Please verify your email first', needsVerification: true, userId: user.id }, { status: 403 });
    }

    if (user.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Generate JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: user.user_type,
      fullName: user.full_name,
    });

    // Generate signed avatar URL if avatar exists
    let avatarUrl: string | null = null;
    if (user.avatar_url) {
      try {
        avatarUrl = resolveMediaUrl(user.avatar_url, {
          container: CONTAINERS.PROFILE_PICTURES,
          expiresInMinutes: 60 * 24,
        });
      } catch { avatarUrl = null; }
    }

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        userType: user.user_type,
        avatarUrl,
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
