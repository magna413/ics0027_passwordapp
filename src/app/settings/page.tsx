'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getCsrfToken, initializeCsrfToken } from '@/lib/csrf-client';

interface TOTPSetupResponse {
  secret: string;
  qrCode: string;
  message: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Check if TOTP is enabled
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Initialize CSRF token on component mount
  useEffect(() => {
    initializeCsrfToken();
  }, []);

  // Fetch MFA status from server
  useEffect(() => {
    if (status === 'authenticated') {
      fetchMfaStatus();
    }
  }, [status]);

  async function fetchMfaStatus() {
    try {
      const response = await fetch('/api/totp/status', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setTotpEnabled(data.mfaEnabled);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch MFA status:', err);
    }
  }


  async function handleSetupTOTP() {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Prevent setup if already enabled
      if (totpEnabled) {
        setError('TOTP is already enabled. Disable it first if you want to set up a new one.');
        return;
      }
      

      const response = await fetch('/api/totp/setup', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to setup TOTP');
      }

      const data: TOTPSetupResponse = await response.json();
      setQrCode(data.qrCode);
      setTotpSecret(data.secret);
      setShowTotpSetup(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to setup TOTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyTOTP(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');

      if (!totpCode || totpCode.length !== 6) {
        setError('TOTP code must be 6 digits');
        return;
      }

      const response = await fetch('/api/totp/verify', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        body: JSON.stringify({
          secret: totpSecret,
          code: totpCode,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to verify TOTP');
      }

      setSuccess('✅ TOTP enabled successfully!');
      setTotpEnabled(true);
      setShowTotpSetup(false);
      setTotpCode('');
      setQrCode('');
      setTotpSecret('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to verify TOTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisableTOTP() {
    if (!confirm('Are you sure you want to disable TOTP? You will lose this security feature.')) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/totp/disable', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disable TOTP');
      }

      setSuccess('✅ TOTP disabled successfully');
      setTotpEnabled(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disable TOTP');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <p className="text-gray-300 text-lg font-semibold">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">⚙️ Settings</h1>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition duration-200"
            style={{ cursor: 'pointer' }}
          >
            <span style={{ pointerEvents: 'none' }}>← Back to Dashboard</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500 border-l-4 border-red-700 text-white rounded-lg font-semibold">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500 border-l-4 border-green-700 text-white rounded-lg font-semibold">
            {success}
          </div>
        )}

        {/* TOTP Settings Card */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="px-8 py-6 border-b-2 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100">
            <h2 className="text-2xl font-bold text-gray-800">🔐 Two-Factor Authentication (TOTP)</h2>
            <p className="text-gray-600 text-sm mt-1">Add an extra layer of security to your account</p>
          </div>

          <div className="p-8">
            {!showTotpSetup && !totpEnabled ? (
              <div className="space-y-4">
                <p className="text-gray-700 font-medium">
                  Enable TOTP-based two-factor authentication to add an extra security layer to your account.
                </p>
                <p className="text-sm text-gray-600">
                  You will need to enter a 6-digit code from your authenticator app (Google Authenticator, Authy, etc.) when logging in.
                </p>
                <button
                  onClick={handleSetupTOTP}
                  disabled={loading}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 transition duration-200 font-bold text-lg hover:cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? '⏳ Setting up...' : '✅ Enable TOTP'}
                </button>
              </div>
            ) : showTotpSetup && !totpEnabled ? (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-bold text-blue-900 mb-3">Step 1: Scan QR Code</h3>
                  <p className="text-sm text-blue-800 mb-4">
                    Open your authenticator app and scan this QR code:
                  </p>
                  {qrCode && (
                    <div className="flex justify-center mb-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrCode}
                        alt="TOTP QR Code"
                        className="w-48 h-48 border-2 border-blue-300 rounded-lg"
                      />
                    </div>
                  )}
                  <p className="text-xs text-blue-700 mt-3">
                    <strong>Manual Entry:</strong> If you can&apos;t scan the QR code, enter this code manually:
                  </p>
                  <code className="block mt-2 p-2 bg-white border border-blue-300 rounded text-sm font-mono text-blue-900">
                    {totpSecret}
                  </code>
                </div>

                <form onSubmit={handleVerifyTOTP} className="space-y-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-bold text-purple-900 mb-3">Step 2: Verify Code</h3>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Enter 6-digit code from your authenticator app:
                    </label>
                    <input
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      placeholder="000000"
                      className="w-full px-4 py-3 border-2 border-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-center font-mono text-3xl font-bold tracking-widest text-purple-900 bg-white disabled:bg-gray-100"
                      disabled={loading}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={loading || totpCode.length !== 6}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 transition duration-200 font-bold text-lg hover:cursor-pointer disabled:cursor-not-allowed"
                    >
                      ✅ Verify & Enable
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowTotpSetup(false);
                        setTotpCode('');
                        setQrCode('');
                      }}
                      className="flex-1 px-6 py-3 bg-gray-400 text-gray-900 rounded-lg hover:bg-gray-500 transition duration-200 font-bold text-lg hover:cursor-pointer"
                    >
                      ❌ Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : totpEnabled ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-900 font-bold">✅ TOTP Enabled</p>
                  <p className="text-sm text-green-800 mt-1">
                    Two-factor authentication is now active. You will need to enter a 6-digit code from your authenticator app when logging in.
                  </p>
                </div>
                <button
                  onClick={handleDisableTOTP}
                  disabled={loading}
                  className="w-full px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-400 transition duration-200 font-bold text-lg hover:cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? '⏳ Disabling...' : '❌ Disable TOTP'}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Security Tips */}
        <div className="mt-8 bg-white rounded-xl shadow-lg p-8 border-l-4 border-yellow-500">
          <h3 className="text-lg font-bold text-gray-800 mb-4">💡 Security Tips</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>✅ Save your authenticator app backup codes in a secure location</li>
            <li>✅ Do not share your authenticator app with anyone</li>
            <li>✅ Use a strong, unique master password along with TOTP</li>
            <li>✅ Keep your authenticator app updated on your device</li>
            <li>✅ If you lose access to your device, you may not be able to login</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
