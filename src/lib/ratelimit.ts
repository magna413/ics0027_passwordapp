/**
 * Simple in-memory rate limiter for protecting authentication endpoints
 * Tracks requests by IP address and enforces time-window-based limits
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Check if a request should be rate limited
 * @param key - Unique identifier (e.g., IP address + endpoint)
 * @param maxRequests - Maximum number of requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetTime) {
    // Create new entry or reset existing one
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return true;
  }

  if (entry.count < maxRequests) {
    entry.count++;
    return true;
  }

  return false;
}

/**
 * Get remaining attempts for a given key
 */
export function getRemainingAttempts(
  key: string,
  maxRequests: number
): number {
  const entry = rateLimitMap.get(key);
  if (!entry || Date.now() >= entry.resetTime) {
    return maxRequests;
  }
  return Math.max(0, maxRequests - entry.count);
}

/**
 * Get time until rate limit resets in seconds
 */
export function getResetTime(key: string): number {
  const entry = rateLimitMap.get(key);
  if (!entry) {
    return 0;
  }
  const remainingMs = Math.max(0, entry.resetTime - Date.now());
  return Math.ceil(remainingMs / 1000);
}

/**
 * Cleanup old entries from the rate limit map (call periodically)
 */
export function cleanupOldEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  rateLimitMap.forEach((entry, key) => {
    if (now >= entry.resetTime) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => {
    rateLimitMap.delete(key);
  });
}

// Cleanup old entries every 10 minutes
setInterval(cleanupOldEntries, 10 * 60 * 1000);
