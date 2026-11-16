export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { consumeResetToken, hashPassword } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { passwordProblem } from '@/lib/email-policy';

/**
 * POST /api/auth/reset-password  (FR-AUTH-03)
 * Sets a new password using the emailed link token. Every existing session
 * of the account is signed out (token_version bump).
 */
export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req) || 'unknown';
    const limited = checkApiRateLimit(ip, 'reset-password', 10);
    if (limited) return limited;

    const { token, password } = await req.json().catch(() => ({}));
    const weak = passwordProblem(password);
    if (weak) return ApiErrors.validation(weak);

    const userId = await consumeResetToken(String(token || ''));
    if (!userId) return ApiErrors.validation('This reset link is invalid or has expired. Request a new one.');

    const passwordHash = await hashPassword(password);
    await query(
      `UPDATE users SET password_hash = $2, token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1`,
      [userId, passwordHash],
    );
    await writeAuditLog({
      action: 'PASSWORD_RESET',
      performedBy: userId,
      targetType: 'user',
      targetId: userId,
      ipAddress: ip === 'unknown' ? null : ip,
    });

    return NextResponse.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (error: unknown) {
    return ApiErrors.serverError('Reset password error:', error);
  }
}
