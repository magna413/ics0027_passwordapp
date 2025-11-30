// lib/csrf.ts
import 'server-only';
import { NextRequest } from 'next/server';

export const CSRF_COOKIE = 'csrf-token';

// Cross-runtime base64url encoder
function base64url(bytes: Uint8Array): string {
  // Browser/Edge path
  // @ts-ignore
  if (typeof btoa === 'function') {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  // Node path: Buffer is global in Node
  // @ts-ignore
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// Cross-runtime CSPRNG
function getRandomBytes(len = 32): Uint8Array {
  // Node 18+/20+: globalThis.crypto exists with webcrypto
  const c: Crypto | undefined = (globalThis as any).crypto;
  const impl: Crypto = c ?? (require('crypto').webcrypto as unknown as Crypto); // only executed in Node, not bundled for Edge
  const arr = new Uint8Array(len);
  impl.getRandomValues(arr);
  return arr;
}

export function issueCsrfToken(): string {
  return base64url(getRandomBytes(32));
}

export async function setCsrfCookie(
  token: string,
  {
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'lax' as 'lax' | 'strict' | 'none',
    maxAge = 60 * 60 * 24 * 7,
  } = {}
) {
  const { cookies } = await import('next/headers'); // loaded at runtime on server only
  const store = await cookies();
  store.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge,
  });
}

// ---- Validation helpers ----
function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function expectedOrigin(req: NextRequest) {
  // Use X-Forwarded-* headers for production environments (reverse proxies)
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const exp = expectedOrigin(req);
  if (origin) return origin === exp;
  if (referer) {
    try { return new URL(referer).origin === exp; } catch {}
  }
  // Allow non-browser clients; token must still match.
  return true;
}

/** Double-submit cookie check for state-changing methods. Throws Error('Invalid CSRF') on failure. */
export async function validateCsrf(req: NextRequest): Promise<void> {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

  const sameOriginOk = isSameOrigin(req);

  if (!sameOriginOk) throw new Error('Invalid CSRF-Origin');

  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value || '';
  const headerToken = req.headers.get('x-csrf-token') || '';

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw new Error('Invalid CSRF-Token');
  }
}
