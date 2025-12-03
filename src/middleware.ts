// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { CSRF_COOKIE, issueCsrfToken } from '@/lib/csrf';
import { checkRateLimitResponse, createRateLimitKey, getClientIp, RATE_LIMIT_CONFIGS } from '@/lib/middleware-ratelimit';

function isApiRoute(pathname: string) {
  return pathname.startsWith('/api');
}
function isNextAuthRoute(pathname: string) {
  return pathname.startsWith('/api/auth');
}
function isStateChanging(method: string) {
  return ['POST','PUT','PATCH','DELETE'].includes(method.toUpperCase());
}
function normalizeOrigin(url: string): string {
  const u = new URL(url);
  // Remove default ports
  if ((u.protocol === 'https:' && u.port === '443') ||
      (u.protocol === 'http:'  && u.port === '80')) {
    u.port = '';
  }
  return u.origin;
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');

  let expected = (forwardedProto && forwardedHost)
    ? `${forwardedProto}://${forwardedHost}`
    : `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const expectedNorm = normalizeOrigin(expected);
  const originNorm   = origin ? normalizeOrigin(origin) : null;
  const refererNorm  = referer ? normalizeOrigin(new URL(referer).origin) : null;

  if (originNorm) return originNorm === expectedNorm;
  if (refererNorm) return refererNorm === expectedNorm;
  return true;
}

export function middleware(request: NextRequest) {
  const isProd = process.env.NODE_ENV === 'production';
  const { pathname } = request.nextUrl;

  // Let NextAuth do its own CSRF/state checks
  if (isNextAuthRoute(pathname)) return NextResponse.next();

  // Rate limiting for sensitive auth endpoints
  if (isStateChanging(request.method)) {
    let rateLimitConfig: typeof RATE_LIMIT_CONFIGS.AUTH_LOGIN | null = null;

    if (pathname.startsWith('/api/opaque/login')) {
      rateLimitConfig = RATE_LIMIT_CONFIGS.AUTH_LOGIN;
    } else if (pathname.startsWith('/api/opaque/register')) {
      rateLimitConfig = RATE_LIMIT_CONFIGS.AUTH_REGISTER;
    } else if (pathname.startsWith('/api/auth/totp-verify')) {
      rateLimitConfig = RATE_LIMIT_CONFIGS.AUTH_TOTP;
    } else if (pathname.startsWith('/api/opaque/change-password')) {
      rateLimitConfig = RATE_LIMIT_CONFIGS.PASSWORD_CHANGE;
    }

    if (rateLimitConfig) {
      const rateLimitResponse = checkRateLimitResponse(request, pathname, rateLimitConfig);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
  }

  // Cheap early block for cross-site state-changing requests at the edge
  if (isStateChanging(request.method) && !sameOrigin(request)) {
    return new NextResponse('CSRF: cross-origin', { status: 403 });
  }

  const res = NextResponse.next();

  // CSRF cookie + header: only set header on page requests (not /api)
  if (!isApiRoute(pathname)) {
    const existing = request.cookies.get(CSRF_COOKIE)?.value;
    const token = existing ?? issueCsrfToken();

    if (!existing) {
      res.cookies.set(CSRF_COOKIE, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    // Expose to same-origin pages so client JS can mirror it in x-csrf-token later
    if (sameOrigin(request)) {
      res.headers.set('x-csrf-token', token);
    }
  }

  // Security headers
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  const csp = isProd
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self';"
    : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none'; form-action 'self';";
  res.headers.set('Content-Security-Policy', csp);
  if (isProd) {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
