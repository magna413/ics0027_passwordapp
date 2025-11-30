'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function VaultPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      router.push('/dashboard');
    }
  }, [status, session, router]);

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col">
        {/* Navigation Bar */}
        <nav className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">🔐 Password Manager</h2>
            <div className="flex gap-3">
              <Link
                href="/login"
                className="px-6 py-2 bg-white text-blue-900 font-semibold rounded-lg hover:bg-blue-50 transition duration-200 shadow-md cursor-pointer"
              >
                Login
              </Link>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-16">
          {/* Sign In Card */}
          <div className="w-full max-w-xl">
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
              <div className="px-8 py-6 border-b-2 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100">
                <h2 className="text-2xl font-bold text-gray-800">Access Your Vault</h2>
                <p className="text-gray-600 text-sm mt-1">Sign in to your account to access your passwords</p>
              </div>

              <div className="p-8 space-y-4">
                <Link
                  href="/login"
                  className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition duration-200 font-bold text-lg shadow-md hover:shadow-lg transform hover:scale-105 cursor-pointer inline-block text-center"
                >
                  🔓 Sign In
                </Link>
                <p className="text-center text-gray-700 font-medium">
                  Don&apos;t have an account?{' '}
                  <Link href="/register" className="text-blue-600 hover:text-blue-700 font-bold underline transition">
                    Create one here
                  </Link>
                </p>
              </div>

              <div className="px-8 py-6 bg-blue-50 border-t border-blue-200">
                <p className="text-xs text-blue-700 font-semibold text-center">
                  🛡️ All communications are encrypted. Your security is our priority.
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-black bg-opacity-30 backdrop-blur-sm border-t border-white border-opacity-10 py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400 text-sm">
            <p>🔒 Your security is our priority. All data is encrypted end-to-end.</p>
          </div>
        </footer>
      </main>
    );
  }

  return null;
}
