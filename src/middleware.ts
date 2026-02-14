import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that REQUIRE login (no guest access)
const authRequiredRoutes = ['/admin'];

/**
 * Decode a JWT payload (no crypto needed) and check the `exp` claim.
 * Returns true only if the token is structurally valid AND not expired.
 */
function isTokenValid(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    // Base64url → Base64 → decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (!payload.exp) return false;
    // exp is in seconds, Date.now() in ms
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
