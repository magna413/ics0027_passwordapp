/**
 * Rate limit middleware utility for Next.js edge middleware
 * Integrates with checkRateLimit to protect sensitive endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRemainingAttempts, getResetTime } from './ratelimit';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// Default configurations for different endpoint types
export const RATE_LIMIT_CONFIGS = {
  // Auth endpoints: strict limits to prevent brute force
  AUTH_LOGIN: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  AUTH_REGISTER: {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  AUTH_TOTP: {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  // Change password: moderate limits
  PASSWORD_CHANGE: {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

/**
 * Extract client IP from NextRequest
 * Handles various proxy headers for different deployment environments
 */
export function getClientIp(request: NextRequest): string {
  // Try multiple headers that proxies might set
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  return ip;
}

/**
 * Create a rate limit key from client IP and endpoint
 */
export function createRateLimitKey(clientIp: string, endpoint: string): string {
  return `${clientIp}:${endpoint}`;
}

/**
 * Check if request is rate limited and return response if so
 * Returns null if request is allowed, otherwise returns a 429 response
 */
export function checkRateLimitResponse(
  request: NextRequest,
  endpoint: string,
  config: RateLimitConfig
): NextResponse | null {
  const clientIp = getClientIp(request);
  const key = createRateLimitKey(clientIp, endpoint);

  if (!checkRateLimit(key, config.maxRequests, config.windowMs)) {
    const resetTime = getResetTime(key);
    return new NextResponse(
      JSON.stringify({
        error: 'Too many requests',
        retryAfter: resetTime,
      }),
      {
        status: 429,
        headers: {
          'Retry-After': String(resetTime),
          'Content-Type': 'application/json',
        },
      }
    );
  }

  return null;
}

/**
 * Convenience function to check rate limit for auth endpoints
 * Returns 429 response if rate limited, null if allowed
 */
export function checkAuthRateLimit(
  request: NextRequest,
  endpoint: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.AUTH_LOGIN
): NextResponse | null {
  return checkRateLimitResponse(request, endpoint, config);
}
