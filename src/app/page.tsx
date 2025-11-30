import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col">
      {/* Navigation Bar */}
      <nav className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">🔐 Password Manager</h2>
          <div className="flex gap-3">
            <Link
              href="/vault"
              className="px-6 py-2 bg-white text-blue-900 font-semibold rounded-lg hover:bg-blue-50 transition duration-200 shadow-md"
              style={{ cursor: 'pointer' }}
            >
              Vault
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-3xl">
          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6 tracking-tight drop-shadow-lg">
            🔐 Secure Password Manager
          </h1>
          <p className="text-xl text-gray-300 leading-relaxed font-medium mb-8">
            Keep your passwords safe with military-grade encryption, secure authentication, and protection against common web vulnerabilities.
          </p>

          {/* Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-12">
            <div className="bg-white bg-opacity-10 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-20">
              <p className="text-blue-300 font-bold text-lg">🔒 AES-256 Encryption</p>
              <p className="text-gray-400 text-sm mt-1">Military-grade encryption</p>
            </div>
            <div className="bg-white bg-opacity-10 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-20">
              <p className="text-green-300 font-bold text-lg">✅ OPAQUE Authentication</p>
              <p className="text-gray-400 text-sm mt-1">Password-authenticated key exchange, CSRF protection</p>
            </div>
            <div className="bg-white bg-opacity-10 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-20">
              <p className="text-purple-300 font-bold text-lg">🛡️ Zero Trust</p>
              <p className="text-gray-400 text-sm mt-1">Server-side validation</p>
            </div>
            <div className="bg-white bg-opacity-10 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-20">
              <p className="text-yellow-300 font-bold text-lg">🔑 End-to-End Encryption</p>
              <p className="text-gray-400 text-sm mt-1">Your vault encrypted locally, never readable by server</p>
            </div>
          </div>

          <Link
            href="/vault"
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition duration-200 font-bold text-lg shadow-md hover:shadow-lg inline-block"
            style={{ cursor: 'pointer' }}
          >
            Access Vault
          </Link>
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