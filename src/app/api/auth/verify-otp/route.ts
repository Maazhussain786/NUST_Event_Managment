export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors } from '@/lib/api-utils';

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

    // Check match
    if (otp.otp_code !== otpCode) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    // Mark OTP as used
    await query('UPDATE otp_tokens SET is_used = TRUE WHERE id = $1', [otp.id]);

    // Activate user
    await query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [userId]);

    // Get user data and generate token
    const userResult = await query(
      'SELECT id, email, full_name, user_type FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: user.user_type,
      fullName: user.full_name,
    });

    const response = NextResponse.json({
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        userType: user.user_type,
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
