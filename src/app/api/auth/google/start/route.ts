export const dynamic = 'force-dynamic';

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAppBaseUrl, getGoogleOAuthConfig } from '@/lib/google-oauth-config';
import { logServerError } from '@/lib/server-logger';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

function sanitizeNextPath(input: string | null): string {
  if (!input) return '/home';
  if (!input.startsWith('/')) return '/home';
  if (input.startsWith('//')) return '/home';
  return input;
}

export async function GET(req: NextRequest) {
  const oauth = getGoogleOAuthConfig(req);
  if (!oauth.configured || !oauth.clientId) {
    logServerError('auth.google.start.config', 'Google OAuth is not configured', {
      missing: oauth.missing,
    });
    const loginUrl = new URL('/login', getAppBaseUrl(req));
    loginUrl.searchParams.set(
      'error',
      'Google sign-in is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local and restart.'
    );
    return NextResponse.redirect(loginUrl);
  }

  const nextPath = sanitizeNextPath(req.nextUrl.searchParams.get('next'));
  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = oauth.redirectUri;

  const authParams = new URLSearchParams({
    client_id: oauth.clientId,
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
