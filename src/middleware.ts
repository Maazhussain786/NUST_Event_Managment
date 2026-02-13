import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that REQUIRE login (no guest access)
const authRequiredRoutes = ['/admin'];
// Routes only for non-authenticated users (redirect to /home if logged in)
const authRoutes = ['/login', '/register', '/verify-otp'];
// Guest-accessible routes (most of the app)
// /home, /societies, /events, /timeline, /tickets, /profile, /settings, /help, /privacy, /favorites, /notifications

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  const { pathname } = request.nextUrl;

  // Skip API routes and static files
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth pages
  if (authRoutes.some(route => pathname.startsWith(route)) && token) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // Only strictly protected routes redirect to login
  if (authRequiredRoutes.some(route => pathname.startsWith(route)) && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)'],
};
