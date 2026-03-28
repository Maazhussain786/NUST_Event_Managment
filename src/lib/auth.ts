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
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<JWTPayload | null> {
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
    if (bearerToken) {
      return verifyToken(bearerToken);
    }
  }

  return null;
}

export async function getUserById(id: string) {
  const result = await query(
    'SELECT id, email, full_name, user_type, status, avatar_url, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}
