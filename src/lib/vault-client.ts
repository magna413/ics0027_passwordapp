// vault-client.ts (drop-in)

// ===== In-memory DEK state =====
let dek: CryptoKey | null = null; // AES-GCM key kept only in RAM

export function isUnlocked() { return dek !== null; }
export function lockVault() { dek = null; }

const TE = new TextEncoder();
const TD = new TextDecoder();

type GcmParams = { aad?: Uint8Array }; // optional associated data (AEAD AAD)

// ===== Base64 helpers (for cleaner API payloads) =====
export function b64e(u8: Uint8Array): string {
  let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
export function b64d(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Pack/unpack iv/ciphertext/tag as base64 when talking to the server
export type GcmPackB64 = { iv: string; ciphertext: string; tag: string };
export function packB64(g: { iv: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array }): GcmPackB64 {
  return { iv: b64e(g.iv), ciphertext: b64e(g.ciphertext), tag: b64e(g.tag) };
}
export function unpackB64(p: GcmPackB64) {
  return { iv: b64d(p.iv), ciphertext: b64d(p.ciphertext), tag: b64d(p.tag) };
}

// ===== AAD builder (binds blobs to identities to prevent swaps) =====
export function makeAAD(userId: string, credentialId?: string, v = 1) {
  const s = credentialId ? `uid:${userId};cid:${credentialId};v:${v}` : `uid:${userId};v:${v}`;
  return TE.encode(s);
}

// ===== DEK import/set =====
export async function setDEK(raw: Uint8Array) {
  dek = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// ===== Registration & Unlock (zero-knowledge) =====

// PBKDF2 demo derivation for EK (swap to Argon2id WASM if you have it)
async function deriveEK(masterPassword: string, wrappingSalt: Uint8Array) {
  const pw = TE.encode(masterPassword);
  const pwKey = await crypto.subtle.importKey('raw', pw as BufferSource, { name: 'PBKDF2' }, false, ['deriveKey']);
  const ek = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: wrappingSalt as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  // Best-effort wipe password bytes
  (pw as any).fill?.(0);
  return ek;
}

// Browser-side: generate DEK and wrap it with EK derived from master password.
// Returns { wrappingSalt, wrappedDEK, dekRaw } and sets in-memory DEK.
export async function generateAndWrapDEKForRegistration(masterPassword: string) {
  const wrappingSalt = crypto.getRandomValues(new Uint8Array(16));
  const ek = await deriveEK(masterPassword, wrappingSalt);

  const dekRaw = crypto.getRandomValues(new Uint8Array(32));
  // Import DEK for encryption and keep it in memory
  dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Wrap DEK (raw 32B) under EK with AES-GCM: payload = ct||tag
  const wrappedPayload = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ek, dekRaw)
  );
  // Store single blob: iv || (ct||tag)
  const wrappedDEK = new Uint8Array(iv.length + wrappedPayload.length);
  wrappedDEK.set(iv, 0);
  wrappedDEK.set(wrappedPayload, iv.length);

  return { wrappingSalt, wrappedDEK, dekRaw };
}

// Unwrap user DEK locally (on login/unlock). Sets in-memory DEK.
export async function unlockVault(masterPassword: string, wrappingSalt: Uint8Array, wrappedDEK: Uint8Array) {
  const ek = await deriveEK(masterPassword, wrappingSalt);
  const iv = wrappedDEK.slice(0, 12);
  const payload = wrappedDEK.slice(12);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, ek, payload);
  dek = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  // wipe temporary
  new Uint8Array(raw).fill(0);
}

// For change-master-password (client-led, zero-knowledge): rewrap existing wrappedDEK
// without ever exposing vault contents to the server.
export async function rewrapDEK(
  wrappedDEK: Uint8Array,
  oldMasterPassword: string,
  oldWrappingSalt: Uint8Array,
  newMasterPassword: string
) {
  try {
    // unwrap with old
    const oldEK = await deriveEK(oldMasterPassword, oldWrappingSalt);
    const ivOld = wrappedDEK.slice(0, 12);
    const payloadOld = wrappedDEK.slice(12);
    const dekRaw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivOld }, oldEK, payloadOld));

    // wrap with new
    const newWrappingSalt = crypto.getRandomValues(new Uint8Array(16));
    const newEK = await deriveEK(newMasterPassword, newWrappingSalt);
    const ivNew = crypto.getRandomValues(new Uint8Array(12));
    const payloadNew = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivNew }, newEK, dekRaw)
    );
    const newWrappedDEK = new Uint8Array(ivNew.length + payloadNew.length);
    newWrappedDEK.set(ivNew, 0);
    newWrappedDEK.set(payloadNew, ivNew.length);

    // best-effort wipe
    dekRaw.fill(0);
    return { newWrappingSalt, newWrappedDEK };
  } catch (err) {
    if (err instanceof Error && (err.name === 'OperationError' || err.message.includes('OperationError'))) {
      throw new Error('Failed to decrypt vault with current password - please verify your current master password is correct');
    }
    throw err;
  }
}

// ===== Per-credential encryption (AES-GCM under DEK) =====

/** Encrypt a plaintext password with the DEK. Returns { iv, ciphertext, tag }. */
export async function encryptPassword(plaintext: string, params: GcmParams = {}) {
  if (!dek) throw new Error('Locked');

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = TE.encode(plaintext.normalize?.('NFC') ?? plaintext);

  const algo: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
  if (params.aad) (algo as any).additionalData = params.aad;

  const ctTag = new Uint8Array(await crypto.subtle.encrypt(algo, dek, enc));
  const TAG_LEN = 16;
  if (ctTag.length < TAG_LEN) throw new Error('Encrypt produced short output');

  const tag = ctTag.slice(ctTag.length - TAG_LEN);
  const ciphertext = ctTag.slice(0, ctTag.length - TAG_LEN);

  return { iv, ciphertext, tag };
}

/** Decrypt a password with the DEK using iv + ciphertext + tag. */
export async function decryptPassword(
  iv: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
  params: GcmParams = {}
) {
  if (!dek) throw new Error('Locked');
  if (iv.length !== 12) throw new Error('Bad IV length');
  if (tag.length !== 16) throw new Error('Bad tag length');

  const ctTag = new Uint8Array(ciphertext.length + tag.length);
  ctTag.set(ciphertext, 0);
  ctTag.set(tag, ciphertext.length);

  const algo: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
  if (params.aad) (algo as any).additionalData = params.aad;

  try {
    const pt = await crypto.subtle.decrypt(algo, dek, ctTag);
    return TD.decode(pt);
  } catch (e: any) {
    if (e?.name === 'OperationError') throw new Error('Decrypt failed (auth)');
    throw e;
  }
}
