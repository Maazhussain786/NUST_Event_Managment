import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that REQUIRE login (no guest access)
const authRequiredRoutes = ['/admin', '/platform', '/society'];

// Routes that are public / auth-flow — never redirect away from these
const publicRoutes = ['/login', '/register', '/verify-otp'];

/**
 * Decode JWT payload without verifying signature.
 *
 * ⚠️ UX-ONLY CHECK — This does NOT verify the JWT signature.
 * Next.js middleware runs in Edge Runtime which doesn't support the Node.js
 * `crypto` module needed by `jsonwebtoken`. This check is solely used for:
 *   - Clearing stale cookies so users aren't stuck
 *   - Redirecting unauthenticated users to /login for protected pages
 *   - Role-based routing (SUPER_ADMIN ↔ USER separation)
 *
 * All actual authentication/authorization is enforced server-side via
 * `getCurrentUser()` in each API route, which properly verifies JWT signatures.
 */
interface TokenPayload {
  exp: number;
  userType?: string;
}

function decodeToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    if (!decoded) return null;
    return JSON.parse(decoded) as TokenPayload;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  const { pathname } = request.nextUrl;

  // Skip middleware work for API routes and static assets.
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/manifest')
  ) {
    return NextResponse.next();
  }

  const payload = token ? decodeToken(token) : null;
  const isExpired = payload ? payload.exp * 1000 <= Date.now() : true;
  // Treat missing or expired payloads as unauthenticated in one place.
  const validToken = !!(payload && !isExpired);

  // If token is stale / invalid, clear it so the user isn't stuck
  if (token && !validToken) {
    const response = NextResponse.next();
    response.cookies.delete('auth_token');
    return response;
  }

  // Only strictly protected routes redirect to login
  if (authRequiredRoutes.some((route) => pathname.startsWith(route)) && !validToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ─── Role-based routing (only if we have a valid token) ─────────────
  if (validToken && payload) {
    const isSuperAdmin = payload.userType === 'SUPER_ADMIN';
    const isOnPlatform = pathname.startsWith('/platform');
    const isOnPublic = publicRoutes.some((r) => pathname.startsWith(r));

    // SUPER_ADMIN on user routes → redirect to /platform (except /society which they can also access)
    if (isSuperAdmin && !isOnPlatform && !isOnPublic && !pathname.startsWith('/society')) {
      return NextResponse.redirect(new URL('/platform', request.url));
    }

    // Regular user on /platform → redirect to /home
    if (!isSuperAdmin && isOnPlatform) {
      return NextResponse.redirect(new URL('/home', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)'],
};
