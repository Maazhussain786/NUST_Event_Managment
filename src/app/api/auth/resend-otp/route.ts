export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { issueAuthCode, secondsSinceLastCode } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors } from '@/lib/api-utils';
import { sendEmail, emailTemplates } from '@/lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COOLDOWN_SECONDS = 60;

/** POST /api/auth/resend-otp — send a fresh verification code (60 s cooldown). */
export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req) || 'unknown';
    const limited = checkApiRateLimit(ip, 'resend-otp', 5);
    if (limited) return limited;

    const { userId } = await req.json().catch(() => ({}));
    if (!userId || !UUID_RE.test(String(userId))) return ApiErrors.validation('User ID is required.');

    const result = await query('SELECT id, email, full_name, status FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];
    // Same answer whether or not the account exists / is pending, to avoid leaking account state.
    const generic = NextResponse.json({ message: 'If the account is awaiting verification, a new code has been sent.' });
    if (!user || user.status !== 'PENDING_VERIFICATION') return generic;

    const age = await secondsSinceLastCode(user.id, 'EMAIL_VERIFICATION');
    if (age !== null && age < COOLDOWN_SECONDS) {
      return NextResponse.json(
        { error: `Please wait ${COOLDOWN_SECONDS - age} seconds before requesting another code.` },
        { status: 429, headers: { 'Retry-After': String(COOLDOWN_SECONDS - age) } },
      );
    }

    const code = await issueAuthCode(user.id, 'EMAIL_VERIFICATION', 15);
    await sendEmail({ to: user.email, ...emailTemplates.verification(user.full_name, code) });
    return generic;
  } catch (error: unknown) {
    return ApiErrors.serverError('Resend OTP error:', error);
  }
}
