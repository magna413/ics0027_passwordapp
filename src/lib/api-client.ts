'use client';

import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { setCsrfToken } from './csrf-client';

/**
 * API client with automatic error handling and logout on 401
 *
 * Features:
 * - Automatically extracts and stores CSRF tokens from response headers
 * - Handles 401 (Unauthorized) by logging out the user
 * - Provides consistent error handling across the app
 */

// Store router for use in top-level function
let routerInstance: ReturnType<typeof useRouter> | null = null;

/**
 * Initialize the API client with router instance
 * Call this once in your main layout or root component
 */
export function initApiClient(router: ReturnType<typeof useRouter>) {
  routerInstance = router;
}

/**
 * Make an API request with automatic CSRF token extraction and 401 handling
 *
 * @param url - The API endpoint URL
 * @param init - Request init options (method, body, headers, etc.)
 * @returns Promise with the response
 *
 * @throws Error if response status is not OK (unless it's 401)
 *
 * On 401 (Unauthorized):
 * - Calls signOut() to clear the session
 * - Redirects to login page
 * - Returns error response without throwing
 */
export async function apiCall(
  url: string,
  init?: RequestInit
): Promise<Response> {
  try {
    const response = await fetch(url, init);

    // Extract CSRF token from response header and store it for next request
    const csrfHeaderToken = response.headers.get('x-csrf-token');
    if (csrfHeaderToken) {
      setCsrfToken(csrfHeaderToken);
    }

    // Handle 401 Unauthorized - logout the user
    if (response.status === 401) {
      console.warn('Received 401 Unauthorized - logging out');
      await signOut({ redirect: false });
      if (routerInstance) {
        routerInstance.push('/login');
      }
      return response;
    }

    if (response.status === 403) {
      console.warn('Received 403 Forbidden - possible CSRF issue, logging out');
      await signOut({ redirect: false });
      if (routerInstance) {
        routerInstance.push('/login');
      }
      return response;
    }

    return response;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

/**
 * Helper to make an API call and parse JSON response
 * Automatically handles CSRF tokens and 401 errors
 */
export async function apiCallJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await apiCall(url, init);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}
