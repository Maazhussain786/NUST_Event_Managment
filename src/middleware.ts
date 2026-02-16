import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that REQUIRE login (no guest access)
const authRequiredRoutes = ['/admin'];

/**
 * Check if a JWT token appears structurally valid and not expired.
 *
 * ⚠️ UX-ONLY CHECK — This does NOT verify the JWT signature.
 * Next.js middleware runs in Edge Runtime which doesn't support the Node.js
 * `crypto` module needed by `jsonwebtoken`. This check is solely used for:
 *   - Clearing stale cookies so users aren't stuck
 *   - Redirecting unauthenticated users to /login for protected pages
 *
 * All actual authentication/authorization is enforced server-side via
 * `getCurrentUser()` in each API route, which properly verifies JWT signatures.
 */
function isTokenValid(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    if (!decoded) return false;
    const payload = JSON.parse(decoded);
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  const { pathname } = request.nextUrl;

  // Skip API routes and static files
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Check if token actually valid (not just present)
  const validToken = token ? isTokenValid(token) : false;

  // If token is stale / invalid, clear it so the user isn't stuck
  if (token && !validToken) {
    const response = NextResponse.next();
    response.cookies.delete('auth_token');
    return response;
  }

  // Only strictly protected routes redirect to login
  if (authRequiredRoutes.some(route => pathname.startsWith(route)) && !validToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)'],
};
