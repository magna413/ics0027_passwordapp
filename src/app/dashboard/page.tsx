'use client';

import { useEffect, useState, FormEvent, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { getCsrfToken, initializeCsrfToken } from '@/lib/csrf-client';
import { apiCall, initApiClient } from '@/lib/api-client';
import { unlockVault, lockVault, encryptPassword, decryptPassword, isUnlocked, b64d } from '@/lib/vault-client';

interface Credential {
  id: string;
  title: string;
  username: string;
  url?: string | null;
  createdAt: string;
  decrypted?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [viewingCredentialId, setViewingCredentialId] = useState<string | null>(null);
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmNewMasterPassword, setConfirmNewMasterPassword] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const clearTimersRef = useRef<Record<string, number>>({});

  // Helper function to unlock vault
  const unlockVaultWithPassword = useCallback(async (masterPassword: string): Promise<boolean> => {
    try {
      const res = await apiCall('/api/vault/keys', { method: 'GET', credentials: 'include' });
      if (res.ok) {
        const { wrappingSalt, wrappedDEK } = await res.json();
        const saltU8 = typeof wrappingSalt === 'string' ? b64d(wrappingSalt) : new Uint8Array(wrappingSalt);
        const wrappedU8 = typeof wrappedDEK === 'string' ? b64d(wrappedDEK) : new Uint8Array(wrappedDEK);
        await unlockVault(masterPassword, saltU8, wrappedU8);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Unlock vault failed:', e);
      return false;
    }
  }, []);


  useEffect(() => {
  (async () => {
    const mp = sessionStorage.getItem('__temp_masterPassword');
    if (mp) {
      await unlockVaultWithPassword(mp);
      sessionStorage.removeItem('__temp_masterPassword'); // remove immediately
    }
  })();
}, [unlockVaultWithPassword]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
  }, [status, router]);

  // Secure sign out: wipe secrets and vault
  function handleSecureSignOut() {
    if (!confirm('This will sign you out. Continue?')) return;
    try { lockVault(); } catch {}
    sessionStorage.removeItem('__temp_masterPassword');
    signOut({ redirect: true, callbackUrl: '/login' });
  }

  // Fetch credentials list
  const fetchCredentials = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiCall('/api/credentials', {
        method: 'GET',
        credentials: 'include',
      });
      if (response.status === 404 || response.status === 401 || response.status === 403) {
        setCredentials([]);
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch credentials');
      const data = await response.json();
      setCredentials(data || []);
    } catch (err) {
      setError('Failed to load credentials');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial setup: init API client, CSRF, try to auto-unlock with temp MP, load list
  useEffect(() => {
    if (status !== 'authenticated') return;

    initApiClient(router);
    initializeCsrfToken();

    (async () => {
      try {
        const tmp = sessionStorage.getItem('__temp_masterPassword');
        if (tmp) {
          const success = await unlockVaultWithPassword(tmp);
          if (!success) {
            setError('Unlock failed. Please unlock again.');
          }
          sessionStorage.removeItem('__temp_masterPassword');
        }
      } catch (e) {
        console.error('Auto-unlock failed:', e);
        setError('Unlock failed. Please unlock again.');
      }
      // Always fetch credentials from API (encrypted)
      await fetchCredentials();
      setLoading(false);
    })();

    return () => { lockVault();};
  }, [status, router, fetchCredentials, unlockVaultWithPassword]);

  // Auto-hide toasts
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(''), 4000);
    return () => window.clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(''), 3000);
    return () => window.clearTimeout(t);
  }, [success]);

  // Auto-logout after inactivity
  useEffect(() => {
    const INACTIVITY_TIMEOUT = 60 * 60 * 1000;
    let inactivityTimer: number | undefined;
    const resetTimer = () => {
      if (inactivityTimer) window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(() => {
        try { lockVault(); } catch {}
        sessionStorage.removeItem('__temp_masterPassword');
        signOut({ redirect: true, callbackUrl: '/login?reason=inactivity' });
      }, INACTIVITY_TIMEOUT);
    };
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(ev =>
      document.addEventListener(ev, resetTimer)
    );
    resetTimer();
    return () => {
      ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(ev =>
        document.removeEventListener(ev, resetTimer)
      );
      if (inactivityTimer) window.clearTimeout(inactivityTimer);
    };
  }, [signOut]);

  // ── Password Prompt Hook ───────────────────────────────
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resolver = useRef<((v: string | null) => void) | undefined>(undefined);

  const promptPassword = useCallback(async () => {
    setVal('');
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
    return new Promise<string | null>((resolve) => { resolver.current = resolve; });
  }, []);

  const submit = useCallback(() => { setOpen(false); resolver.current?.(val || null); }, [val]);
  const cancel = useCallback(() => { setOpen(false); resolver.current?.(null); }, []);

  const PasswordPromptModal = open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-3 text-lg font-bold text-gray-900">Unlock vault</h3>
        <label className="mb-2 block text-sm font-medium text-gray-700">Master password</label>
        <input
          ref={inputRef}
          type="password"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); }}
          className="mb-4 w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
          placeholder="••••••••••"
          autoComplete="current-password"
        />
        <div className="flex gap-2">
          <button onClick={submit} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">
            Unlock
          </button>
          <button onClick={cancel} className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-800 hover:bg-gray-300">
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const handleShowForm = useCallback(async () => {
    if (!isUnlocked()) {
      const mp = await promptPassword();
      if (!mp) return;
      try {
        const success = await unlockVaultWithPassword(mp);
        if (!success) {
          setError('Failed to unlock vault');
          return;
        }
      } catch (e) {
        setError('Failed to unlock vault');
        return;
      }
    }
    setShowForm(true);
  }, [promptPassword, unlockVaultWithPassword]);

  // Add credential (client-encrypt)
  const handleAddCredential = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!title || !username || !password) { setError('All fields are required'); return; }
    if (!isUnlocked()) { setError('Vault is locked. Please re-unlock.'); return; }
    try {
      const { iv, ciphertext, tag } = await encryptPassword(password /*, { aad } */);
      const response = await apiCall('/api/credentials', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
  body: JSON.stringify({
    title, username, url: url || undefined,
    iv: Array.from(iv),
    ciphertext: Array.from(ciphertext),
    tag: Array.from(tag),          // <-- include tag
  }),
});
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any).error || 'Failed to add credential');
      }
      setSuccess('Credential added successfully');
      setTitle(''); setUsername(''); setUrl(''); setPassword('');
      setShowForm(false);
      await fetchCredentials();
    } catch (err: any) {
      setError(err?.message || 'Failed to add credential');
    }
  }, [title, username, password, url, fetchCredentials]);

  // View credential (client-decrypt)
  const handleViewCredential = useCallback(async (credentialId: string) => {
    try {
      if (!isUnlocked()) {
        const mp = await promptPassword();
        if (!mp) return;
        try {
          const success = await unlockVaultWithPassword(mp);
          if (!success) {
            setError('Failed to unlock vault');
            return;
          }
        } catch (e) {
          setError('Failed to unlock vault');
          return;
        }
      }

      const res = await apiCall(`/api/credentials/${credentialId}`, { method: 'GET', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch secret');
      const { iv, ciphertext, tag } = await res.json();
      const decrypted = await decryptPassword(new Uint8Array(iv), new Uint8Array(ciphertext), new Uint8Array(tag));
      setCredentials(prev => prev.map(c => c.id === credentialId ? ({ ...c, decrypted }) : c));
      setViewingCredentialId(credentialId);
      // Optional auto-clear timer (example 60s)
      // window.clearTimeout(clearTimersRef.current[credentialId]);
      // clearTimersRef.current[credentialId] = window.setTimeout(() => {
      //   setCredentials(prev => prev.map(c => c.id === credentialId ? ({ ...c, decrypted: undefined }) : c));
      //   setViewingCredentialId(null);
      // }, 60_000);
    } catch (err: any) {
      setError(err?.message || 'Failed to view credential');
    }
  }, [promptPassword, unlockVaultWithPassword]);

  async function handleEditCredential(credentialId: string) {
    try {
      const cred = credentials.find(c => c.id === credentialId);
      if (!cred) return;
      setEditingCredentialId(credentialId);
      setEditTitle(cred.title);
      setEditUsername(cred.username);
      setEditUrl(cred.url || '');
      setEditPassword('');
      setViewingCredentialId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load credential for editing');
    }
  }

  // Save (client re-encrypt if password changed)
  const handleSaveCredential = useCallback(async (credentialId: string) => {
    try {
      setError('');
      if (!editTitle || !editUsername) { setError('Title and username are required'); return; }
      let payload: any = {
        credentialId, action: 'update',
        title: editTitle, username: editUsername, url: editUrl || null,
      };
      if (editPassword) {
  const { iv, ciphertext, tag } = await encryptPassword(editPassword /*, { aad } */);
  payload.iv = Array.from(iv);
  payload.ciphertext = Array.from(ciphertext);
  payload.tag = Array.from(tag);   // <-- include tag
}
      const response = await apiCall(`/api/credentials/${credentialId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any).error || 'Failed to update credential');
      }
      setSuccess('Credential updated successfully');
      setEditingCredentialId(null);
      setEditTitle(''); setEditUsername(''); setEditUrl(''); setEditPassword('');
      await fetchCredentials();
    } catch (err: any) {
      setError(err?.message || 'Failed to save credential');
    }
  }, [editTitle, editUsername, editUrl, editPassword, fetchCredentials]);

  async function handleDeleteCredential(credentialId: string) {
    if (!confirm('Are you sure you want to delete this credential? This action cannot be undone.')) return;
    try {
      setError('');
      const response = await apiCall(`/api/credentials/${credentialId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ credentialId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any).error || 'Failed to delete credential');
      }
      setSuccess('Credential deleted successfully');
      setViewingCredentialId(null);
      await fetchCredentials();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete credential');
    }
  }

  // Change Master Password using OPAQUE protocol (re-registration with new password)
  async function handleChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!currentPasswordInput) { setError('Current master password is required'); return; }
    if (!newMasterPassword) { setError('New master password is required'); return; }
    if (newMasterPassword.length < 12) { setError('New master password must be at least 12 characters'); return; }
    if (newMasterPassword !== confirmNewMasterPassword) { setError('New master passwords do not match'); return; }
    if (currentPasswordInput === newMasterPassword) { setError('New master password must be different from current password'); return; }

    try {
      setLoading(true);
      const opaque = await import('@serenity-kit/opaque');
      const vaultClient = await import('@/lib/vault-client');

      await opaque.ready;

      // Get current vault keys to rewrap the DEK (not create a new one)
      const keysRes = await apiCall('/api/vault/keys', { method: 'GET', credentials: 'include' });
      if (!keysRes.ok) throw new Error('Failed to retrieve vault keys');
      const { wrappingSalt: oldSaltB64, wrappedDEK: oldWrappedDEKB64 } = await keysRes.json();
      const oldSalt = typeof oldSaltB64 === 'string' ? b64d(oldSaltB64) : new Uint8Array(oldSaltB64);
      const oldWrappedDEK = typeof oldWrappedDEKB64 === 'string' ? b64d(oldWrappedDEKB64) : new Uint8Array(oldWrappedDEKB64);

      // Rewrap the existing DEK with the new password (keeping credentials accessible)
      const { newWrappingSalt, newWrappedDEK } = await vaultClient.rewrapDEK(
        oldWrappedDEK,
        currentPasswordInput,
        oldSalt,
        newMasterPassword
      );

      // Step 1: Start OPAQUE re-registration with new password
      const { registrationRequest, clientRegistrationState } = opaque.client.startRegistration({ password: newMasterPassword });

      const startRes = await apiCall('/api/opaque/change-password/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ registrationRequest }),
      });

      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        throw new Error((data as any).error || 'Failed to start password change');
      }

      const { registrationResponse, serverChangePasswordStateId } = await startRes.json();

      // Step 2: Finish OPAQUE re-registration
      const finishRegResult = opaque.client.finishRegistration({
        password: newMasterPassword,
        registrationResponse,
        clientRegistrationState,
      });

      if (!finishRegResult) {
        throw new Error('OPAQUE registration finish failed');
      }

      const { registrationRecord } = finishRegResult;

      const finishRes = await apiCall('/api/opaque/change-password/finish', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({
          registrationRecord,
          serverChangePasswordStateId,
          wrappingSaltB64: btoa(String.fromCharCode(...newWrappingSalt)),
          wrappedDEKB64: btoa(String.fromCharCode(...newWrappedDEK)),
        }),
      });

      if (!finishRes.ok) {
        const data = await finishRes.json().catch(() => ({}));
        throw new Error((data as any).error || 'Failed to finish password change');
      }

      // Re-unlock vault with the new password
      await unlockVault(newMasterPassword, newWrappingSalt, newWrappedDEK);
      setSuccess('✅ Master password changed and vault re-unlocked!');

      setCurrentPasswordInput('');
      setNewMasterPassword('');
      setConfirmNewMasterPassword('');
      setShowChangePasswordModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change master password');
    } finally {
      setLoading(false);
    }
  }

  // Helper functions for vault key derivation
  async function deriveEKInBrowser(password: string, salt: Uint8Array): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
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
    const ekKey = await crypto.subtle.importKey('raw', ekBytes.slice().buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt']);
    const ctTag = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ekKey, dekBytes.slice().buffer as ArrayBuffer));
    const wrapped = new Uint8Array(iv.length + ctTag.length);
    wrapped.set(iv, 0);
    wrapped.set(ctTag, iv.length);
    return { wrapped };
  }

  function handleLogout() {
    try { lockVault(); } catch {}
    
    sessionStorage.removeItem('masterPassword');
    signOut({ redirect: true, callbackUrl: '/login' });
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Password Prompt Modal */}
      {PasswordPromptModal}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[60] space-y-2">
        {error && (
          <div className="relative p-4 bg-red-500 border-l-4 border-red-700 text-white rounded-lg shadow-md font-semibold pr-10">
            ❌ {error}
            <button onClick={() => setError('')} className="absolute top-2 right-2/ align-middle text-white/80 hover:text-white" aria-label="Close error" title="Close">✕</button>
          </div>
        )}
        {success && (
          <div className="relative p-4 bg-green-500 border-l-4 border-green-700 text-white rounded-lg shadow-md font-semibold pr-10">
            ✅ {success}
            <button onClick={() => setSuccess('')} className="absolute top-2 right-2 text-white/80 hover:text-white" aria-label="Close success" title="Close">✕</button>
          </div>
        )}
      </div>

      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">🔐 Password Manager</h1>
            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <span className="text-xs sm:text-sm text-blue-100 font-medium truncate px-2 py-1">{session.user?.email}</span>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => router.push('/settings')} className="relative z-10 select-none flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-purple-500 text-white text-sm sm:text-base font-semibold rounded-lg hover:bg-purple-600 transition-colors duration-200 min-h-[44px] sm:min-h-auto flex items-center justify-center" title="Manage security settings and 2FA">
                  <span>⚙️</span><span className="hidden sm:inline">&nbsp;Settings</span>
                </button>
                <button type="button" onClick={() => setShowChangePasswordModal(true)} className="relative z-10 select-none flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-yellow-500 text-white text-sm sm:text-base font-semibold rounded-lg hover:bg-yellow-600 transition-colors duration-200 min-h-[44px] sm:min-h-auto flex items-center justify-center" title="Change your master password">
                  <span>🔑</span><span className="hidden sm:inline">&nbsp;Change</span>
                </button>
                <button type="button" onClick={handleSecureSignOut} className="relative z-10 select-none flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-red-500 text-white text-sm sm:text-base font-semibold rounded-lg hover:bg-red-600 transition-colors duration-200 min-h-[44px] sm:min-h-auto flex items-center justify-center">
                  <span>🚪</span><span className="hidden sm:inline">&nbsp;Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add Credential */}
        <div className="mb-8">
          {!showForm ? (
            <button onClick={handleShowForm} className="relative z-10 select-none px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors duration-200 font-bold text-lg shadow-lg hover:cursor-pointer">
              ➕ Add New Credential
            </button>
          ) : (
            <div className="bg-white rounded-xl shadow-2xl p-8">
              <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b-2 border-blue-500 pb-3">Add New Credential</h2>
              <form onSubmit={handleAddCredential} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Title</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-800 font-medium" placeholder="e.g., Gmail"/>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Username/Email</label>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-800 font-medium" placeholder="your@email.com"/>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">URL (optional)</label>
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-800 font-medium" placeholder="https://example.com"/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-800 font-medium" placeholder="••••••••"/>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="relative z-10 select-none flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-colors duration-200 font-bold text-lg shadow-md cursor-pointer">✅ Save Credential</button>
                  <button type="button" onClick={() => { setShowForm(false); setTitle(''); setUsername(''); setUrl(''); setPassword(''); }} className="relative z-10 select-none flex-1 px-6 py-3 bg-gray-400 text-gray-900 rounded-lg hover:bg-gray-500 transition-colors duration-200 font-bold text-lg shadow-md cursor-pointer">❌ Cancel</button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Credentials List */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="px-8 py-6 border-b-2 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100">
            <h2 className="text-2xl font-bold text-gray-800">🔑 Your Credentials</h2>
          </div>

          {credentials.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-xl text-gray-500 font-semibold">No credentials saved yet. Add one to get started!</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full mb-6">
                  <thead className="bg-gradient-to-r from-blue-100 to-blue-50 border-b-2 border-blue-300">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-800">Title</th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-800">URL</th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-800">Added</th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-800">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((cred, idx) => {
                      let host = '';
                      try { if (cred.url) host = new URL(cred.url).hostname; } catch {}
                      return (
                        <tr key={cred.id} className={`border-b transition-colors duration-200 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50`}>
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900 truncate max-w-[150px]">{cred.title}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {cred.url ? (
                              <a href={cred.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium underline truncate max-w-[200px] inline-block">{host || cred.url}</a>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 font-medium">{new Date(cred.createdAt).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-sm flex gap-2">
                            <button onClick={() => handleViewCredential(cred.id)} className="relative z-10 select-none px-4 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-md cursor-pointer">👁️ View</button>
                            <button onClick={() => handleEditCredential(cred.id)} className="relative z-10 select-none px-4 py-2 bg-yellow-500 text-white font-bold rounded-lg hover:bg-yellow-600 transition-colors duration-200 shadow-md cursor-pointer">✏️ Edit</button>
                            <button onClick={() => handleDeleteCredential(cred.id)} className="relative z-10 select-none px-4 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition-colors duration-200 shadow-md cursor-pointer">🗑️ Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="sm:hidden space-y-3 px-4 pb-4">
                {credentials.map((cred) => {
                  let host = '';
                  try { if (cred.url) host = new URL(cred.url).hostname; } catch {}
                  return (
                    <div key={cred.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:bg-blue-50 transition-colors duration-200">
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <h3 className="font-bold text-gray-900 text-sm flex-1 truncate">{cred.title}</h3>
                        <button onClick={() => handleViewCredential(cred.id)} className="relative z-10 select-none px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-md cursor-pointer whitespace-nowrap">👁️ View</button>
                      </div>
                      {cred.url && (
                        <p className="text-xs text-gray-600 mb-2 truncate">
                          <span className="font-semibold">URL:</span> {host || cred.url}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        <span className="font-semibold">Added:</span> {new Date(cred.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  );
                })}
              </div>

              {viewingCredentialId && !editingCredentialId && (
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-400 rounded-xl p-8 shadow-xl">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-blue-300">
                    <h3 className="text-2xl font-bold text-gray-800">🔓 View Credential</h3>
                    <button onClick={() => setViewingCredentialId(null)} className="relative z-10 select-none text-gray-600 hover:text-gray-800 text-3xl font-bold transition-colors duration-200 cursor-pointer">✕</button>
                  </div>
                  <div className="space-y-5">
                    {(() => {
                      const cred = credentials.find(c => c.id === viewingCredentialId)!;
                      return (
                        <>
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Title</label>
                            <p className="px-5 py-3 bg-white rounded-lg border-2 border-gray-300 text-gray-900 font-semibold">{cred.title}</p>
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
                            <p className="px-5 py-3 bg-white rounded-lg border-2 border-gray-300 text-gray-900 font-semibold">{cred.username}</p>
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
                            <p className="px-5 py-3 bg-white rounded-lg border-2 border-gray-300 font-mono text-gray-900 font-semibold break-all text-sm">
                              {cred.decrypted}
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              await navigator.clipboard.writeText(cred.decrypted || '');
                              setSuccess('Password copied to clipboard');
                              setTimeout(async () => {
                                try { await navigator.clipboard.writeText(''); } catch {}
                              }, 20000);
                            }}
                            className="relative z-10 select-none w-full px-5 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-colors duration-200 font-bold text-lg shadow-md cursor-pointer"
                          >
                            📋 Copy Password
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {editingCredentialId && (
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-400 rounded-xl p-8 shadow-xl">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-yellow-300">
                    <h3 className="text-2xl font-bold text-gray-800">✏️ Edit Credential</h3>
                    <button onClick={() => setEditingCredentialId(null)} className="relative z-10 select-none text-gray-600 hover:text-gray-800 text-3xl font-bold transition-colors duration-200 cursor-pointer">✕</button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Title</label>
                      <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-800 font-medium"/>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
                      <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-800 font-medium"/>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">URL (optional)</label>
                      <input type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-800 font-medium"/>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">New Password (leave blank to keep current)</label>
                      <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-800 font-medium"/>
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button onClick={() => handleSaveCredential(editingCredentialId)} className="relative z-10 select-none flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-colors duration-200 font-bold text-lg shadow-md cursor-pointer">✅ Save Changes</button>
                      <button onClick={() => setEditingCredentialId(null)} className="relative z-10 select-none flex-1 px-6 py-3 bg-gray-400 text-gray-900 rounded-lg hover:bg-gray-500 transition-colors duration-200 font-bold text-lg shadow-md cursor-pointer">❌ Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Change Master Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 pointer-events-none">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 pointer-events-auto relative z-[51]">
            <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-blue-300">
              <h3 className="text-2xl font-bold text-gray-800">🔑 Change Master Password</h3>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setCurrentPasswordInput('');
                  setNewMasterPassword('');
                  setConfirmNewMasterPassword('');
                }}
                className="relative z-10 select-none text-gray-600 hover:text-gray-800 text-3xl font-bold transition-colors duration-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Current Master Password</label>
                <input type="password" value={currentPasswordInput} onChange={(e) => setCurrentPasswordInput(e.target.value)} autoComplete="current-password" className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-colors text-gray-800 font-medium" placeholder="Enter current master password"/>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">New Master Password (min. 12 characters)</label>
                <input type="password" value={newMasterPassword} onChange={(e) => setNewMasterPassword(e.target.value)} autoComplete="new-password" className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-colors text-gray-800 font-medium" placeholder="Enter new master password" minLength={12}/>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Confirm New Master Password</label>
                <input type="password" value={confirmNewMasterPassword} onChange={(e) => setConfirmNewMasterPassword(e.target.value)} autoComplete="new-password" className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-colors text-gray-800 font-medium" placeholder="Confirm new master password" minLength={12}/>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="relative z-10 select-none flex-1 px-6 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-colors duration-200 font-bold text-lg shadow-md cursor-pointer">✅ Change Password</button>
                <button type="button" onClick={() => {
                  setShowChangePasswordModal(false);
                  setCurrentPasswordInput('');
                  setNewMasterPassword('');
                  setConfirmNewMasterPassword('');
                }} className="relative z-10 select-none flex-1 px-6 py-3 bg-gray-400 text-gray-900 rounded-lg hover:bg-gray-500 transition-colors duration-200 font-bold text-lg shadow-md cursor-pointer">❌ Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
