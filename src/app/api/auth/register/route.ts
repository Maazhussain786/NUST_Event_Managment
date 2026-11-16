export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword, issueAuthCode, secondsSinceLastCode } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors } from '@/lib/api-utils';
import {
  isNustStudentEmailForSignup,
  NUST_ONLY_ERROR_MESSAGE,
  normalizeEmail,
  passwordProblem,
} from '@/lib/email-policy';
import { sendEmail, emailTemplates } from '@/lib/email';

const OTP_TTL_MINUTES = 15;

/**
 * POST /api/auth/register  (FR-AUTH-01, FR-AUTH-04)
 * Creates an unverified account and emails a 6-digit code. The account becomes
 * usable only after /api/auth/verify-otp confirms the code.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req) || 'unknown';
    const limited = checkApiRateLimit(ip, 'register', 5);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const fullName = String(body.fullName || '').trim();
    const cmsId = body.cmsId ? String(body.cmsId).trim() : null;
    const { password } = body;

    if (!email || !password || !fullName) {
      return ApiErrors.validation('Name, email and password are required.');
    }
    if (fullName.length > 200) return ApiErrors.validation('Name is too long.');
    if (cmsId && !/^[0-9]{4,12}$/.test(cmsId)) return ApiErrors.validation('CMS ID must be 4-12 digits.');
    if (!isNustStudentEmailForSignup(email)) return ApiErrors.validation(NUST_ONLY_ERROR_MESSAGE);
    const weak = passwordProblem(password);
    if (weak) return ApiErrors.validation(weak);

    const emailLimited = checkApiRateLimit(`email:${email}`, 'register', 3);
    if (emailLimited) return emailLimited;

    const passwordHash = await hashPassword(password);
    const existing = await query('SELECT id, status FROM users WHERE email = $1', [email]);
    let userId: string;

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status !== 'PENDING_VERIFICATION') {
        return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });
      }
      // Unverified account: let the owner restart sign-up (the code still goes to the same inbox).
      userId = row.id;
      const age = await secondsSinceLastCode(userId, 'EMAIL_VERIFICATION');
      if (age !== null && age < 60) {
        return NextResponse.json({ needsVerification: true, userId, email, message: 'A code was just sent. Check your inbox.' }, { status: 200 });
      }
      await query(
        'UPDATE users SET full_name = $2, password_hash = $3, cms_id = COALESCE($4, cms_id), updated_at = NOW() WHERE id = $1',
        [userId, fullName, passwordHash, cmsId],
      );
    } else {
      if (cmsId) {
        const cmsTaken = await query('SELECT 1 FROM users WHERE cms_id = $1', [cmsId]);
        if (cmsTaken.rows.length > 0) return ApiErrors.conflict('This CMS ID is already registered.');
      }
      const inserted = await query(
        `INSERT INTO users (email, password_hash, full_name, user_type, status, cms_id)
         VALUES ($1, $2, $3, 'STUDENT', 'PENDING_VERIFICATION', $4)
         RETURNING id`,
        [email, passwordHash, fullName, cmsId],
      );
      userId = inserted.rows[0].id;
    }

    const code = await issueAuthCode(userId, 'EMAIL_VERIFICATION', OTP_TTL_MINUTES);
    await sendEmail({ to: email, ...emailTemplates.verification(fullName, code) });

    return NextResponse.json(
      {
        needsVerification: true,
        userId,
        email,
        message: 'We sent a 6-digit code to your email. Enter it to activate your account.',
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return ApiErrors.serverError('Registration error:', error);
  }
}
