import { NextRequest, NextResponse } from 'next/server';

// ── Protected routes — require authentication ─────────────────────────────────
const PROTECTED = ['/feed', '/search', '/messages', '/stories', '/notifications',
  '/profile', '/games', '/music', '/entertainment'];

// ── Auth routes — redirect to feed if already logged in ──────────────────────
const AUTH_ROUTES = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('__session')?.value
    || request.cookies.get('firebase-auth-token')?.value;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  // Security headers on every response
  const response = NextResponse.next();

  // ── Security headers ──────────────────────────────────────────────────────
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // ── Route protection: redirect to login if no session ────────────────────
  if (isProtected && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
};
