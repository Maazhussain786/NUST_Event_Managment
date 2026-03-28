export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateToken, setAuthCookie } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit } from '@/lib/api-utils';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';
import { shouldReturnAuthToken } from '@/lib/auth-response';

export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req);
    const rateLimited = checkApiRateLimit(ip || 'unknown', 'verify-otp', 10);
    if (rateLimited) return rateLimited;

    const { userId, otpCode } = await req.json();

    if (!userId || !otpCode) {
      return NextResponse.json({ error: 'User ID and OTP required' }, { status: 400 });
    }

    // Find valid OTP
    const otpResult = await query(
      `SELECT id, otp_code, expires_at, is_used FROM otp_tokens 
       WHERE user_id = $1 AND purpose = 'EMAIL_VERIFICATION' AND is_used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (otpResult.rows.length === 0) {
      return NextResponse.json({ error: 'No valid OTP found. Request a new one.' }, { status: 400 });
    }

    const otp = otpResult.rows[0];

    // Check expiry
    if (new Date(otp.expires_at) < new Date()) {
      return NextResponse.json({ error: 'OTP expired. Request a new one.' }, { status: 400 });
    }

    // Check match (coerce to string in case client sends a number)
    if (otp.otp_code !== String(otpCode)) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    // Mark OTP as used
    await query('UPDATE otp_tokens SET is_used = TRUE WHERE id = $1', [otp.id]);

    // Activate user
    await query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [userId]);

    // Get user data and generate token
    const userResult = await query(
      'SELECT id, email, full_name, user_type, avatar_url FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: user.user_type,
      fullName: user.full_name,
    });
    const includeToken = shouldReturnAuthToken(req);
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

    const responseBody: {
      message: string;
      user: {
        id: string;
        email: string;
        fullName: string;
        userType: 'SUPER_ADMIN' | 'STUDENT';
        avatarUrl: string | null;
      };
      token?: string;
    } = {
      message: 'Email verified successfully',
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
    const response = NextResponse.json(responseBody);
    setAuthCookie(response, token);

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
