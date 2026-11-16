export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  setAuthCookie,
  tokenPayloadFromUser,
  issueAuthCode,
  secondsSinceLastCode,
} from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors } from '@/lib/api-utils';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';
import { shouldReturnAuthToken } from '@/lib/auth-response';
import { normalizeEmail } from '@/lib/email-policy';
import { sendEmail, emailTemplates } from '@/lib/email';

const INVALID = () => NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

// A real bcrypt hash (computed once) to compare against when the email is unknown.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword(`unused-${Date.now()}`);
  return dummyHash;
}

export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req) || 'unknown';
    const limited = checkApiRateLimit(ip, 'login', 10);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const password = body.password;
    if (!email || !password) return ApiErrors.validation('Email and password required');

    // Per-account limit too, so rotating IPs (or spoofed forwarding headers) can't brute-force one account.
    const accountLimited = checkApiRateLimit(`email:${email}`, 'login', 8);
    if (accountLimited) return accountLimited;

    const result = await query(
      `SELECT id, email, password_hash, full_name, user_type, status, avatar_url, token_version
       FROM users WHERE email = $1`,
      [email],
    );
    const user = result.rows[0];
    if (!user) {
      // Spend comparable time so response timing doesn't reveal unknown emails.
      await verifyPassword(String(password), await getDummyHash());
      return INVALID();
    }

    // Check the password before revealing anything about the account's state.
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return INVALID();

    if (user.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'This account is suspended. Contact the administrators.' }, { status: 403 });
    }

    if (user.status === 'PENDING_VERIFICATION') {
      const age = await secondsSinceLastCode(user.id, 'EMAIL_VERIFICATION');
      if (age === null || age >= 60) {
        const code = await issueAuthCode(user.id, 'EMAIL_VERIFICATION', 15);
        await sendEmail({ to: user.email, ...emailTemplates.verification(user.full_name, code) });
      }
      return NextResponse.json(
        { error: 'Please verify your email first. We sent you a code.', needsVerification: true, userId: user.id },
        { status: 403 },
      );
    }

    await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(tokenPayloadFromUser(user));
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

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, fullName: user.full_name, userType: user.user_type, avatarUrl },
      ...(shouldReturnAuthToken(req) ? { token } : {}),
    });
    setAuthCookie(response, token);
    return response;
  } catch (error: unknown) {
    return ApiErrors.serverError('Login error:', error);
  }
}
