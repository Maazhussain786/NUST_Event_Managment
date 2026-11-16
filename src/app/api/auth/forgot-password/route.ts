export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { issueAuthCode, secondsSinceLastCode } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors } from '@/lib/api-utils';
import { normalizeEmail } from '@/lib/email-policy';
import { sendEmail, emailTemplates, appBaseUrl } from '@/lib/email';

/**
 * POST /api/auth/forgot-password  (FR-AUTH-03)
 * Emails a one-time reset link. Always answers the same way so the endpoint
 * can't be used to discover which emails have accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req) || 'unknown';
    const limited = checkApiRateLimit(ip, 'forgot-password', 5);
    if (limited) return limited;

    const email = normalizeEmail((await req.json().catch(() => ({}))).email);
    if (!email) return ApiErrors.validation('Email is required.');

    const generic = NextResponse.json({
      message: 'If an account exists for this email, a password reset link has been sent.',
    });

    const emailLimited = checkApiRateLimit(`email:${email}`, 'forgot-password', 3);
    if (emailLimited) return generic;

    const result = await query("SELECT id, full_name, status FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user || user.status !== 'ACTIVE') return generic;

    const age = await secondsSinceLastCode(user.id, 'PASSWORD_RESET');
    if (age !== null && age < 60) return generic;

    const token = await issueAuthCode(user.id, 'PASSWORD_RESET', 30);
    const link = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({ to: email, ...emailTemplates.passwordReset(user.full_name, link) });
    return generic;
  } catch (error: unknown) {
    return ApiErrors.serverError('Forgot password error:', error);
  }
}
