import { NextRequest } from 'next/server';

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getAppBaseUrl(req: NextRequest): string {
  const configured = firstNonEmpty(process.env.APP_BASE_URL);
  if (configured) return trimTrailingSlashes(configured);
  return trimTrailingSlashes(req.nextUrl.origin);
}

export function getGoogleOAuthConfig(req: NextRequest) {
  const clientId = firstNonEmpty(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  );
  const clientSecret = firstNonEmpty(
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  const redirectUri =
    firstNonEmpty(process.env.GOOGLE_REDIRECT_URI, process.env.GOOGLE_OAUTH_REDIRECT_URI) ||
    `${getAppBaseUrl(req)}/api/auth/google/callback`;

  const missing: string[] = [];
  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');

  return {
    clientId,
    clientSecret,
    redirectUri,
    missing,
    configured: missing.length === 0,
  };
}
