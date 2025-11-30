'use client';


import { LoginError } from '@/lib/errors'; 
import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { getCsrfToken, initializeCsrfToken } from '@/lib/csrf-client';
import { apiCall } from '@/lib/api-client';
import { unlockVault, b64d, isUnlocked } from '@/lib/vault-client';

// OPAQUE client
import * as opaque from '@serenity-kit/opaque';

type Step = 'password' | 'totp';
type Mode = 'unknown' | 'opaque';

async function deriveLoginToken(sessionKey: string): Promise<string> {
  // same: UTF-8 bytes of the string
  const data = new TextEncoder().encode(sessionKey);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashBytes = new Uint8Array(hashBuffer);

  // Turn bytes → binary string → base64
  let binary = '';
  for (let i = 0; i < hashBytes.length; i++) {
    binary += String.fromCharCode(hashBytes[i]);
  }
  return btoa(binary); // standard base64
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
const [totpCode, setTotpCode] = useState('');
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);

// 2FA step handling
const [step, setStep] = useState<Step>('password');

// one-time login token derived from OPAQUE sessionKey
const [loginToken, setLoginToken] = useState<string | null>(null);

  // Initialize CSRF token on component mount
  useEffect(() => {
    initializeCsrfToken().catch(() => {
      console.error('Failed to initialize CSRF token');
    });
  }, []);


 async function tryOpaqueLogin(): Promise<
  { status: 'ok'; sessionKey: string } |
  { status: 'mfa'; sessionKey: string }
> {
  try {
    await opaque.ready;
    const { clientLoginState, startLoginRequest } = opaque.client.startLogin({ password });

    const r1 = await apiCall('/api/opaque/login/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': getCsrfToken(),
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), msg1: startLoginRequest }),
      credentials: 'include',
    });

    if (!r1.ok) {
      if (r1.status === 401) {
        throw new LoginError(
          'INVALID_CREDENTIALS',
          'Invalid email or password',
          'password',
        );
      }

      // For any other error, use generic message to prevent username enumeration
      console.error('OPAQUE login start error - status:', r1.status);
      throw new LoginError('SERVER', 'Login failed. Please try again.');
    }

    const { msg2, serverLoginStateId } = await r1.json();

    let loginResult;
    try {
      loginResult = opaque.client.finishLogin({
        clientLoginState,
        loginResponse: msg2,
        password,
      });
    } catch (opaqueErr) {
      // Client-side OPAQUE validation threw an error - fake response or protocol error
      console.warn('Client-side OPAQUE finishLogin threw error:', opaqueErr);
      throw new LoginError('INVALID_CREDENTIALS', 'Invalid email or password', 'password');
    }

    if (!loginResult) {
      // Client-side OPAQUE validation failed - likely fake response or wrong password
      console.warn('Client-side OPAQUE finishLogin returned null/false - fake response or wrong password');
      throw new LoginError('INVALID_CREDENTIALS', 'Invalid email or password', 'password');
    }

    const { finishLoginRequest, sessionKey } = loginResult;

    const r2 = await apiCall('/api/opaque/login/finish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': getCsrfToken(),
      },
      body: JSON.stringify({ msg3: finishLoginRequest, serverLoginStateId }),
      credentials: 'include',
    });

    if (!r2.ok) {
      let serverMessage = 'Login failed';
      try {
        const data = await r2.json();
        if (data?.error) serverMessage = data.error;
      } catch {
        /* ignore */
      }

      throw new LoginError('SERVER', serverMessage);
    }

    const data = await r2.json();
    if (!data.ok) {
      // Login verification failed - password was incorrect or session invalid
      throw new LoginError('INVALID_CREDENTIALS', 'Invalid email or password', 'password');
    }

    if (data.pendingMfa) {
      return { status: 'mfa', sessionKey };
    }

    return { status: 'ok', sessionKey };
  } catch (e) {
    console.error('tryOpaqueLogin error:', e);

    if (e instanceof LoginError) {
      // bubble up as-is
      throw e;
    }

    // Network or unexpected errors
    if (e instanceof TypeError) {
      // fetch usually throws TypeError on network failure
      throw new LoginError('NETWORK', 'Network error during login. Please check your connection and try again.');
    }

    throw new LoginError('UNKNOWN', 'Unexpected error during login. Please try again.');
  }
}


async function handleSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    // Always carry MP once (for vault auto-unlock after we have a session)
    sessionStorage.setItem('__temp_masterPassword', password);

    if (step === 'password') {
      const res = await tryOpaqueLogin();

      const loginToken = await deriveLoginToken(res.sessionKey);
      setLoginToken(loginToken);

      if (res.status === 'ok') {
        const result = await signIn('opaque', {
          token: loginToken,
          totpCode: '',
          redirect: false,
        });

        if (result?.error) {
          throw new LoginError('SERVER', 'Sign in failed');
        }

        router.push('/dashboard');
        return;
      }

      if (res.status === 'mfa') {
        setStep('totp');
        setError('');
        return;
      }
    } else if (step === 'totp') {
      if (!loginToken) {
        throw new LoginError('UNKNOWN', 'Login session expired. Please try again.');
      }

      if (!totpCode || totpCode.length !== 6) {
        throw new LoginError('INVALID_TOTP', 'TOTP code must be 6 digits', 'totp');
      }

      const result = await signIn('opaque', {
        token: loginToken,
        totpCode,
        redirect: false,
      });

      if (result?.error) {
        // Optionally check result.error for more detail
        throw new LoginError(
          'INVALID_TOTP',
          'Invalid authenticator code. Please try again.',
          'totp',
        );
      }

      router.push('/dashboard');
      return;
    }
  } catch (err) {
    console.error('Login error:', err);

    if (err instanceof LoginError) {
      switch (err.code) {
        case 'INVALID_CREDENTIALS':
          setError('Invalid email or password');
          break;
        case 'INVALID_TOTP':
          setError(err.message || 'Invalid authenticator code');
          break;
        case 'NETWORK':
          setError('Unable to reach the server. Check your connection and try again.');
          break;
        case 'SERVER':
          setError('Login failed. Please try again.');
          break;
        case 'OPAQUE':
          setError('Login failed. Please try again.');
          break;
        default:
          setError('An unexpected error occurred. Please try again.');
      }
    } else {
      setError('An unexpected error occurred. Please try again.');
    }

    sessionStorage.removeItem('__temp_masterPassword');
  } finally {
    setLoading(false);
  }
}



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">🔐</h1>
          <h2 className="text-3xl font-bold text-white mb-2">Password Manager</h2>
          <p className="text-gray-400 text-sm">
            {step === 'password' ? 'Sign in to your account' : 'Verify your identity'}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-8 border border-gray-200">
          {error && (
            <div className="mb-6 p-4 bg-red-500 border-l-4 border-red-700 text-white rounded-lg font-semibold flex items-center gap-2">
              ❌ {error}
            </div>
          )}

          {step === 'password' ? (
  <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">
                  📧 Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  disabled={loading}
                  required
                  autoComplete="username email"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-800 font-medium placeholder-gray-500 disabled:bg-gray-100"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-2">
                  🔑 Master Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-800 font-medium placeholder-gray-500 disabled:bg-gray-100"
                  placeholder="••••••••"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Your password never leaves your device. We use OPAQUE, a secure password-authenticated key exchange.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 transition duration-200 font-bold text-lg shadow-md hover:shadow-lg transform hover:scale-105 disabled:scale-100 disabled:hover:shadow-md cursor-pointer"
              >
                {loading ? '⏳ Signing in...' : '🔓 Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-purple-900 font-semibold">
                  ✅ Password verified! Now enter your authenticator code.
                </p>
              </div>

              <div>
                <label htmlFor="totpCode" className="block text-sm font-bold text-gray-700 mb-2">
                  🔐 Authenticator Code
                </label>
                <input
                  id="totpCode"
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  placeholder="000000"
                  disabled={loading}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  className="w-full px-4 py-3 border-2 border-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-center font-mono text-3xl font-bold tracking-widest text-purple-900 bg-white disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 transition duration-200 font-bold text-lg shadow-md hover:shadow-lg transform hover:scale-105 disabled:scale-100 disabled:hover:shadow-md cursor-pointer"
              >
                {loading ? '⏳ Verifying...' : '✅ Verify & Login'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('password');
                  setTotpCode('');
                  setError('');
                }}
                disabled={loading}
                className="w-full px-6 py-3 bg-gray-400 text-gray-900 rounded-lg hover:bg-gray-500 disabled:bg-gray-300 transition duration-200 font-bold text-lg cursor-pointer"
              >
                ← Back
              </button>
            </form>
          )}

          {step === 'password' && (
            <>
              <div className="mt-8 pt-6 border-t-2 border-gray-200 text-center">
                <p className="text-gray-700 font-medium">
                  Don&apos;t have an account?{' '}
                  <Link href="/register" className="text-blue-600 hover:text-blue-700 font-bold underline transition">
                    Create one here
                  </Link>
                </p>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700 font-semibold text-center">
                  🛡️ OPAQUE prevents your password from ever leaving your device for unmatched security.
                </p>
              </div>

              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs text-orange-700 font-semibold mb-2">⚠️ Forgot Your Master Password?</p>
                <p className="text-xs text-orange-600 leading-relaxed">
                  Your master password <strong>cannot be recovered</strong> due to end-to-end encryption.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-gray-400 hover:text-gray-300 text-sm font-medium transition">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
