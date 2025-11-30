'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { getCsrfToken, initializeCsrfToken } from '@/lib/csrf-client';

// OPAQUE client
import * as opaque from '@serenity-kit/opaque';

// ======== Crypto helpers (browser WebCrypto) ========

function utf8(s: string) {
  return new TextEncoder().encode(s);
}
function toB64(u8: Uint8Array) {
  let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function fromB64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveEKInBrowser(password: string, salt: Uint8Array): Promise<Uint8Array> {
  // PBKDF2-SHA256, 310000 iterations → 32 bytes EK
  const keyMaterial = await crypto.subtle.importKey('raw', utf8(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const ekKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', ekKey);
  return new Uint8Array(raw);
}

async function wrapDEKWithEK(ekBytes: Uint8Array, dekBytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ekKeyBuffer = new Uint8Array(ekBytes).buffer;
  const ekKey = await crypto.subtle.importKey('raw', ekKeyBuffer, 'AES-GCM', false, ['encrypt']);
  // ciphertext || tag
  const dekKeyBuffer = new Uint8Array(dekBytes).buffer;
  const ctTag = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ekKey, dekKeyBuffer));
  // Store a single blob: iv || ct||tag
  const wrapped = new Uint8Array(iv.length + ctTag.length);
  wrapped.set(iv, 0);
  wrapped.set(ctTag, iv.length);
  return { wrapped };
}

function genDEK(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ====================================================

export default function RegisterPage() {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [csrfReady, setCsrfReady] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard');
  }, [status, router]);

  useEffect(() => {
    initializeCsrfToken()
      .then(() => setCsrfReady(true))
      .catch(() => {
        console.error('Failed to initialize CSRF token');
        setCsrfReady(true); // Allow submission anyway
      });
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || !confirmPassword) return setError('All fields are required');
    if (password !== confirmPassword) return setError('Passwords do not match');
    if (password.length < 12) return setError('Master password must be at least 12 characters');

    setLoading(true);
    try {
      // --- Zero-knowledge vault setup in the browser (unchanged) ---
      const wrappingSalt = crypto.getRandomValues(new Uint8Array(16));
      const ek = await deriveEKInBrowser(password, wrappingSalt);
      const dek = genDEK();
      const { wrapped } = await wrapDEKWithEK(ek, dek); // wrapped = iv||ct||tag

      // --- OPAQUE Registration (password NEVER sent to server) ---
      // msg1
      const { registrationRequest, clientRegistrationState } = opaque.client.startRegistration({ password });


      const startRes = await fetch('/api/opaque/register/start', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        body: JSON.stringify({
          email: normalizedEmail,
          msg1: registrationRequest,              // library-formatted (string/bytes)
        }),
      });
      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        throw new Error((data as any).error || 'Registration start failed');
      }
      const { msg2 } = await startRes.json();

      // msg3
      const { registrationRecord } = opaque.client.finishRegistration({
        clientRegistrationState,
        registrationResponse: msg2,
        password,
      });
      if (!registrationRecord) throw new Error('Registration finish failed');
     

      const finishRes = await fetch('/api/opaque/register/finish', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        body: JSON.stringify({
          email: normalizedEmail,
          msg3: registrationRecord,
          wrappingSaltB64: toB64(wrappingSalt),   // server stores
          wrappedDEKB64: toB64(wrapped),          // server stores
        }),
      });
      if (!finishRes.ok) {
        const data = await finishRes.json().catch(() => ({}));
        throw new Error((data as any).error || 'Registration finish failed');
      }

      // Carry MP once through login → dashboard auto-unlock flow
      sessionStorage.setItem('__temp_masterPassword', password);

      router.push('/login?registered=true')
      router.refresh();
    } catch (err: any) {
      console.error('Register error:', err);
      setError(err?.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">🔐</h1>
          <h2 className="text-3xl font-bold text-white mb-2">Password Manager</h2>
          <p className="text-gray-400 text-sm">Create your secure account</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-8 border border-gray-200">
          {error && (
            <div className="mb-6 p-4 bg-red-500 border-l-4 border-red-700 text-white rounded-lg font-semibold flex items-center gap-2">
              ❌ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">
                📧 Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-800 font-medium placeholder-gray-500"
                placeholder="your@email.com"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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
                minLength={12}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-800 font-medium placeholder-gray-500"
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-600 mt-2 font-medium">
                💡 Your vault key is derived locally. The server stores only a wrapped key, never your plaintext vault data.
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-bold text-gray-700 mb-2">
                ✅ Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
                minLength={12}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-800 font-medium placeholder-gray-500"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !csrfReady}
              className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 transition duration-200 font-bold text-lg shadow-md hover:shadow-lg transform hover:scale-105 disabled:scale-100 disabled:hover:shadow-md cursor-pointer"
            >
              {loading ? '⏳ Creating account...' : !csrfReady ? '⏳ Initializing...' : '✨ Create Account'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t-2 border-gray-200 text-center">
            <p className="text-gray-700 font-medium">
              Already have an account?{' '}
              <Link href="/login" className="text-blue-600 hover:text-blue-700 font-bold underline transition">
                Sign in here
              </Link>
            </p>
          </div>

          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs text-green-700 font-semibold text-center">
              🔒 End-to-end: credentials are encrypted client-side; the server only stores ciphertext and wrapped keys.
            </p>
          </div>

          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700 font-semibold mb-2">🚨 Important: Password Recovery</p>
            <p className="text-xs text-red-600 leading-relaxed">
              Your master password <strong>cannot be recovered</strong>. If you forget it, your vault cannot be decrypted.
            </p>
          </div>
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
