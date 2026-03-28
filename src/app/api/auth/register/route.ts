export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword, generateToken, setAuthCookie } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit } from '@/lib/api-utils';
import { isNustStudentEmailForSignup, NUST_ONLY_ERROR_MESSAGE } from '@/lib/email-policy';
import { shouldReturnAuthToken } from '@/lib/auth-response';

export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req);
    const rateLimited = checkApiRateLimit(ip || 'unknown', 'register', 5);
    if (rateLimited) return rateLimited;

    const { email, password, fullName } = await req.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedName = String(fullName || '').trim();

    if (!normalizedEmail || !password || !normalizedName) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    // Must be NUST email
    if (!isNustStudentEmailForSignup(normalizedEmail)) {
      return NextResponse.json({ error: NUST_ONLY_ERROR_MESSAGE }, { status: 400 });
    }

    // Check existing
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    }

    // Hash password & create user (skip OTP — directly ACTIVE for testing)
    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, user_type, status) 
       VALUES ($1, $2, $3, 'STUDENT', 'ACTIVE') 
       RETURNING id, email, full_name, user_type`,
      [normalizedEmail, passwordHash, normalizedName]
    );

    const user = result.rows[0];

    // Generate JWT and set cookie so user is logged in immediately
    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: user.user_type,
      fullName: user.full_name,
    });
    const includeToken = shouldReturnAuthToken(req);

    const responseBody: {
      message: string;
      userId: string;
      user: {
        id: string;
        email: string;
        fullName: string;
        userType: 'SUPER_ADMIN' | 'STUDENT';
        avatarUrl: null;
      };
      token?: string;
    } = {
      message: 'Account created successfully.',
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        userType: user.user_type,
        avatarUrl: null,
      },
    };
    if (includeToken) {
      responseBody.token = token;
    }

    const response = NextResponse.json(responseBody, { status: 201 });
    setAuthCookie(response, token);

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
