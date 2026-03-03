export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/auth';
import { extractIpAddress, checkApiRateLimit, ApiErrors } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  try {
    const ip = extractIpAddress(req);
    const rateLimited = checkApiRateLimit(ip || 'unknown', 'register', 5);
    if (rateLimited) return rateLimited;

    const { email, password, fullName } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    // Must be NUST email
    if (!email.endsWith('.edu.pk')) {
      return NextResponse.json({ error: 'Use your official university email' }, { status: 400 });
    }

    // Check existing
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    }

    // Hash password & create user (skip OTP — directly ACTIVE for testing)
    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, user_type, status) 
       VALUES ($1, $2, $3, 'STUDENT', 'ACTIVE') 
       RETURNING id, email, full_name, user_type`,
      [email, passwordHash, fullName]
    );

    const user = result.rows[0];

    // Generate JWT and set cookie so user is logged in immediately
    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: user.user_type,
      fullName: user.full_name,
    });

    const response = NextResponse.json({
      message: 'Account created successfully.',
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        userType: user.user_type,
      },
    }, { status: 201 });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
