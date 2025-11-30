'use client';

// In-memory token used for fetches
let csrfToken = '';

export function setCsrfToken(token: string) {
  csrfToken = token;
}
export function getCsrfToken() {
  return csrfToken;
}

/**
 * Initialize from a same-origin page response.
 * HEAD '/' is cheap and will carry the x-csrf-token header set by middleware.
 */
export async function initializeCsrfToken(): Promise<void> {
  try {
    const res = await fetch('/', { method: 'HEAD', cache: 'no-store', credentials: 'include' });
    const token = res.headers.get('x-csrf-token');
    if (token) setCsrfToken(token);
  } catch (e) {
    console.error('Failed to initialize CSRF token:', e);
  }
}

/**
 * Wrap fetch to always attach x-csrf-token on unsafe methods,
 * and refresh token from any response that includes it.
 */
export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const t = getCsrfToken();
    if (t) headers.set('x-csrf-token', t);
  }
  const res = await fetch(input, { ...init, headers, credentials: 'same-origin' as RequestCredentials });
  const newToken = res.headers.get('x-csrf-token');
  if (newToken) setCsrfToken(newToken);
  return res;
}
