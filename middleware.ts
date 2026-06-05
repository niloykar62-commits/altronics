import { NextRequest, NextResponse } from 'next/server';

// ── Protected routes — require authentication ─────────────────────────────────
const PROTECTED = [
  '/feed', '/search', '/messages', '/stories', '/notifications',
  '/profile', '/games', '/music', '/entertainment', '/vibe-rooms',
];

// ── Auth routes — redirect to feed if already logged in ──────────────────────
const AUTH_ROUTES = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Security headers on every response ───────────────────────────────────
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self https://meet.jit.si), microphone=(self https://meet.jit.si), geolocation=()');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // ── IMPORTANT: Firebase Auth is client-side only ──────────────────────────
  // Firebase does NOT set server-readable cookies by default.
  // Middleware cannot verify Firebase auth state — that's handled inside each
  // page via onAuthStateChanged(). Trying to check cookies here will always
  // fail and redirect logged-in users back to /login.
  //
  // The correct pattern: let all routes through in middleware, and guard
  // each protected page client-side with onAuthStateChanged → router.push('/login').
  // This is exactly what every page already does.
  //
  // If you later want true server-side auth checking, you need Firebase Admin SDK
  // + a session cookie flow (firebase-admin + custom token endpoint) — that's a
  // separate feature, not needed for this app's current architecture.

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files, api routes, and Next.js internals
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.webp).*)',
  ],
};
