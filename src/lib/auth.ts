import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from './db';
import { cookies, headers } from 'next/headers';
import type { NextResponse } from 'next/server';

let _jwtSecret: string | null = null;
function getJwtSecret(): string {
  if (!_jwtSecret) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required. Set it in .env or .env.local');
    }
    _jwtSecret = secret;
  }
  return _jwtSecret;
}
const JWT_EXPIRES = '7d';
const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface JWTPayload {
  userId: string;
  email: string;
  userType: 'SUPER_ADMIN' | 'STUDENT';
  fullName: string;
  /** users.token_version when the token was issued; bumping it revokes all sessions. */
  tv: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES });
}

export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as JWTPayload;
    return { ...payload, tv: Number(payload.tv ?? 0) };
  } catch {
    return null;
  }
}

async function readTokenFromRequest(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (token) {
    const payload = verifyToken(token);
    if (payload) return payload;
  }

  // Mobile/native fallback: allow Bearer token auth for API calls.
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) return verifyToken(bearerToken);
  }
  return null;
}

/**
 * The signed-in user, re-checked against the database on every call so that
 * suspensions, role changes (e.g. a removed super admin) and password resets
 * take effect immediately instead of when the 7-day token expires.
 */
export async function getCurrentUser(): Promise<JWTPayload | null> {
  const payload = await readTokenFromRequest();
  if (!payload) return null;

  const result = await query(
    `SELECT email, full_name, user_type, status, token_version
     FROM users WHERE id = $1`,
    [payload.userId],
  );
  const row = result.rows[0];
  if (!row || row.status !== 'ACTIVE') return null;
  if (Number(row.token_version) !== payload.tv) return null;

  return {
    userId: payload.userId,
    email: row.email,
    fullName: row.full_name,
    userType: row.user_type,
    tv: Number(row.token_version),
  };
}

/** Builds a token payload from a users row (must include token_version). */
export function tokenPayloadFromUser(user: {
  id: string;
  email: string;
  user_type: 'SUPER_ADMIN' | 'STUDENT';
  full_name: string;
  token_version: number | string;
}): JWTPayload {
  return {
    userId: user.id,
    email: user.email,
    userType: user.user_type,
    fullName: user.full_name,
    tv: Number(user.token_version ?? 0),
  };
}

export async function getUserById(id: string) {
  const result = await query(
    'SELECT id, email, full_name, user_type, status, avatar_url, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// One-time codes (email verification OTP, password reset link)
// Only SHA-256 hashes are stored; codes expire and allow a limited number of tries.
// ---------------------------------------------------------------------------

export type AuthCodePurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
const MAX_CODE_ATTEMPTS = 5;

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/** Issues a new code for the user, invalidating any earlier unused code of the same purpose. */
export async function issueAuthCode(
  userId: string,
  purpose: AuthCodePurpose,
  ttlMinutes: number,
): Promise<string> {
  const code = purpose === 'EMAIL_VERIFICATION' ? generateOTP() : crypto.randomBytes(32).toString('base64url');
  await query(
    `UPDATE auth_codes SET used_at = NOW()
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose],
  );
  await query(
    `INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)`,
    [userId, purpose, hashCode(code), String(ttlMinutes)],
  );
  return code;
}

/** Seconds since the latest code of this purpose was issued (null if none). */
export async function secondsSinceLastCode(userId: string, purpose: AuthCodePurpose): Promise<number | null> {
  const result = await query(
    `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS age
     FROM auth_codes WHERE user_id = $1 AND purpose = $2`,
    [userId, purpose],
  );
  const age = result.rows[0]?.age;
  return age === null || age === undefined ? null : Number(age);
}

export type OtpResult = 'ok' | 'invalid' | 'expired' | 'too_many_attempts' | 'missing';

/** Checks a 6-digit verification code for a user and consumes it on success. */
export async function consumeOtp(userId: string, purpose: AuthCodePurpose, code: string): Promise<OtpResult> {
  const result = await query(
    `SELECT id, code_hash, attempts, expires_at
     FROM auth_codes
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose],
  );
  const row = result.rows[0];
  if (!row) return 'missing';
  if (new Date(row.expires_at) < new Date()) return 'expired';
  if (row.attempts >= MAX_CODE_ATTEMPTS) return 'too_many_attempts';

  const expected = Buffer.from(row.code_hash, 'hex');
  const actual = Buffer.from(hashCode(String(code).trim()), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    await query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return row.attempts + 1 >= MAX_CODE_ATTEMPTS ? 'too_many_attempts' : 'invalid';
  }

  const consumed = await query(
    'UPDATE auth_codes SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id',
    [row.id],
  );
  return consumed.rows.length > 0 ? 'ok' : 'invalid';
}

/** Consumes a password-reset link token. Returns the user id, or null if invalid/expired/used. */
export async function consumeResetToken(token: string): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const result = await query(
    `UPDATE auth_codes SET used_at = NOW()
     WHERE code_hash = $1 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL AND expires_at > NOW()
     RETURNING user_id`,
    [hashCode(token)],
  );
  return result.rows[0]?.user_id ?? null;
}
