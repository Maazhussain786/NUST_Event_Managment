export const dynamic = 'force-dynamic';

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

function sanitizeNextPath(input: string | null): string {
  if (!input) return '/home';
  if (!input.startsWith('/')) return '/home';
  if (input.startsWith('//')) return '/home';
  return input;
}

function getPublicBaseUrl(req: NextRequest): string {
  const envBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envBaseUrl) return envBaseUrl.replace(/\/+$/, '');
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google auth is not configured' }, { status: 500 });
  }

  const nextPath = sanitizeNextPath(req.nextUrl.searchParams.get('next'));
  const state = crypto.randomBytes(24).toString('hex');
  const baseUrl = getPublicBaseUrl(req);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
    include_granted_scopes: 'true',
  });

  const response = NextResponse.redirect(`${GOOGLE_AUTH_URL}?${authParams.toString()}`);
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: 10 * 60,
  });
  response.cookies.set('google_oauth_next', nextPath, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: 10 * 60,
  });

  return response;
}

