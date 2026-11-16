export const dynamic = 'force-dynamic';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateToken, hashPassword, setAuthCookie, tokenPayloadFromUser } from '@/lib/auth';
import { onAccountActivated } from '@/lib/account-activation';
import { isAllowedNustEmail, normalizeEmail, NUST_ONLY_ERROR_MESSAGE } from '@/lib/email-policy';
import { getAppBaseUrl, getGoogleOAuthConfig } from '@/lib/google-oauth-config';
import { logServerError } from '@/lib/server-logger';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

function toLoginRedirect(req: NextRequest, message: string): URL {
  const url = new URL('/login', getAppBaseUrl(req));
  url.searchParams.set('error', message);
  return url;
}

function sanitizeNextPath(input: string | null | undefined): string {
  if (!input) return '/home';
  if (!input.startsWith('/')) return '/home';
  if (input.startsWith('//')) return '/home';
  return input;
}

interface GoogleTokenInfo {
  aud: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
}

export async function GET(req: NextRequest) {
  const oauth = getGoogleOAuthConfig(req);
  if (!oauth.configured || !oauth.clientId || !oauth.clientSecret) {
    logServerError('auth.google.callback.config', 'Google OAuth callback blocked', {
      missing: oauth.missing,
    });
    return NextResponse.redirect(
      toLoginRedirect(req, 'Google authentication is not configured. Contact support.')
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('google_oauth_state')?.value || '';
  const nextPath = sanitizeNextPath(cookieStore.get('google_oauth_next')?.value);

  const state = req.nextUrl.searchParams.get('state') || '';
  const code = req.nextUrl.searchParams.get('code');
  const googleError = req.nextUrl.searchParams.get('error');

  const clearOAuthCookies = (res: NextResponse) => {
    res.cookies.set('google_oauth_state', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 0,
    });
    res.cookies.set('google_oauth_next', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 0,
    });
  };

  if (googleError) {
    const res = NextResponse.redirect(toLoginRedirect(req, 'Google sign-in was cancelled.'));
    clearOAuthCookies(res);
    return res;
  }

  if (!code || !state || state !== expectedState) {
    const res = NextResponse.redirect(toLoginRedirect(req, 'Google sign-in validation failed.'));
    clearOAuthCookies(res);
    return res;
  }

  try {
    const baseUrl = getAppBaseUrl(req);
    const redirectUri = oauth.redirectUri;

    const tokenExchangeRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    });

    const tokenExchange = await tokenExchangeRes.json().catch(() => ({} as Record<string, unknown>));
    if (!tokenExchangeRes.ok || !tokenExchange.id_token) {
      const res = NextResponse.redirect(toLoginRedirect(req, 'Failed to complete Google sign-in.'));
      clearOAuthCookies(res);
      return res;
    }

    const idToken = String(tokenExchange.id_token);
    const tokenInfoRes = await fetch(
      `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`,
      { cache: 'no-store' }
    );
    const tokenInfo = (await tokenInfoRes.json().catch(() => ({}))) as GoogleTokenInfo;

    const email = normalizeEmail(tokenInfo.email || '');
    const emailVerified =
      tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';

    if (!tokenInfoRes.ok || tokenInfo.aud !== oauth.clientId || !email || !emailVerified) {
      const res = NextResponse.redirect(toLoginRedirect(req, 'Google token verification failed.'));
      clearOAuthCookies(res);
      return res;
    }

    if (!isAllowedNustEmail(email)) {
      const res = NextResponse.redirect(toLoginRedirect(req, NUST_ONLY_ERROR_MESSAGE));
      clearOAuthCookies(res);
      return res;
    }

    const fullName = String(tokenInfo.name || email.split('@')[0] || 'NUST Student').trim();
    const existing = await query(
      `SELECT id, email, full_name, user_type, status, token_version
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    let user = existing.rows[0];
    let activatedNow = false;
    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const randomHash = await hashPassword(randomPassword);
      const created = await query(
        `INSERT INTO users (email, password_hash, full_name, user_type, status, email_verified_at, last_login_at)
         VALUES ($1, $2, $3, 'STUDENT', 'ACTIVE', NOW(), NOW())
         RETURNING id, email, full_name, user_type, status, token_version`,
        [email, randomHash, fullName]
      );
      user = created.rows[0];
      activatedNow = true;
    } else {
      if (user.status === 'SUSPENDED') {
        const res = NextResponse.redirect(toLoginRedirect(req, 'Account suspended'));
        clearOAuthCookies(res);
        return res;
      }
      if (user.status === 'PENDING_VERIFICATION') {
        // The unverified password may have been set by someone who doesn't own this
        // inbox; Google just proved ownership, so replace it. The owner can set a
        // password later through "Forgot password".
        const randomHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
        const activated = await query(
          `UPDATE users
           SET status = 'ACTIVE', full_name = COALESCE(NULLIF($2, ''), full_name),
               password_hash = $3, email_verified_at = NOW(), last_login_at = NOW(),
               token_version = token_version + 1, updated_at = NOW()
           WHERE id = $1
           RETURNING id, email, full_name, user_type, status, token_version`,
          [user.id, fullName, randomHash]
        );
        user = activated.rows[0];
        activatedNow = true;
      } else {
        await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
      }
    }

    if (activatedNow) await onAccountActivated(user.id, user.email);

    const token = generateToken(tokenPayloadFromUser(user));

    const res = NextResponse.redirect(new URL(nextPath, baseUrl));
    setAuthCookie(res, token);
    clearOAuthCookies(res);
    return res;
  } catch (error) {
    logServerError('auth.google.callback.failure', error);
    const res = NextResponse.redirect(toLoginRedirect(req, 'Google sign-in failed. Try again.'));
    clearOAuthCookies(res);
    return res;
  }
}
