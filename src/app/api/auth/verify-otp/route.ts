export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { consumeOtp, generateToken, setAuthCookie, tokenPayloadFromUser } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors } from '@/lib/api-utils';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';
import { shouldReturnAuthToken } from '@/lib/auth-response';
import { onAccountActivated } from '@/lib/account-activation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/auth/verify-otp — confirm the emailed code and activate the account. */
export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req) || 'unknown';
    const limited = checkApiRateLimit(ip, 'verify-otp', 10);
    if (limited) return limited;

    const { userId, otpCode } = await req.json().catch(() => ({}));
    if (!userId || !UUID_RE.test(String(userId)) || !otpCode) {
      return ApiErrors.validation('User ID and code are required.');
    }

    const userResult = await query('SELECT id, status FROM users WHERE id = $1', [userId]);
    const existing = userResult.rows[0];
    if (!existing) return ApiErrors.validation('Invalid or expired code.');
    if (existing.status === 'ACTIVE') {
      return ApiErrors.validation('This account is already verified. Please sign in.');
    }
    if (existing.status !== 'PENDING_VERIFICATION') {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    const outcome = await consumeOtp(userId, 'EMAIL_VERIFICATION', String(otpCode));
    if (outcome !== 'ok') {
      const messages: Record<string, string> = {
        missing: 'No active code. Request a new one.',
        expired: 'This code has expired. Request a new one.',
        too_many_attempts: 'Too many wrong attempts. Request a new code.',
        invalid: 'Incorrect code.',
      };
      return ApiErrors.validation(messages[outcome]);
    }

    const activated = await query(
      `UPDATE users SET status = 'ACTIVE', email_verified_at = NOW(), last_login_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'PENDING_VERIFICATION'
       RETURNING id, email, full_name, user_type, avatar_url, token_version`,
      [userId],
    );
    const user = activated.rows[0];
    if (!user) return ApiErrors.validation('This account is already verified. Please sign in.');

    await onAccountActivated(user.id, user.email);

    const token = generateToken(tokenPayloadFromUser(user));
    let avatarUrl: string | null = null;
    if (user.avatar_url) {
      try {
        avatarUrl = resolveMediaUrl(user.avatar_url, { container: CONTAINERS.PROFILE_PICTURES, expiresInMinutes: 60 * 24 });
      } catch {
        avatarUrl = null;
      }
    }

    const response = NextResponse.json({
      message: 'Email verified successfully',
      user: { id: user.id, email: user.email, fullName: user.full_name, userType: user.user_type, avatarUrl },
      ...(shouldReturnAuthToken(req) ? { token } : {}),
    });
    setAuthCookie(response, token);
    return response;
  } catch (error: unknown) {
    return ApiErrors.serverError('Verify OTP error:', error);
  }
}
