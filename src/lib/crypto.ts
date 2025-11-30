'use server';

import { randomBytes, webcrypto as _wc } from 'node:crypto';
import * as argon2 from 'argon2';

const wc = _wc as unknown as Crypto; // Node WebCrypto

const ARGON2_MEMORY = parseInt(process.env.ARGON2_MEMORY ?? '65536', 10);
const ARGON2_TIME = parseInt(process.env.ARGON2_TIME ?? '3', 10);
const ARGON2_PARALLELISM = parseInt(process.env.ARGON2_PARALLELISM ?? '1', 10);

export async function deriveEK(masterPassword: string, wrappingSalt: Uint8Array) {
  // Argon2id to 32 bytes
  const hash = await argon2.hash(masterPassword, {
    type: argon2.argon2id,
    memoryCost: ARGON2_MEMORY,
    timeCost: ARGON2_TIME,
    parallelism: ARGON2_PARALLELISM,
    salt: Buffer.from(wrappingSalt),
    hashLength: 32,
    raw: true,
  });
  // Convert buffer to Uint8Array for Web Crypto API compatibility
  const hashArray = Buffer.isBuffer(hash) ? new Uint8Array(hash) : new Uint8Array(hash as ArrayBuffer);
  return wc.subtle.importKey('raw', hashArray as unknown as ArrayBuffer, 'AES-GCM', false, ['encrypt','decrypt']);
}

export async function genDEK() {
  return wc.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt']);
}

export async function wrapDEK(ek: CryptoKey, dek: CryptoKey) {
  const iv = new Uint8Array(randomBytes(12));
  const raw = await wc.subtle.exportKey('raw', dek);
  const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as ArrayBuffer }, ek, raw as unknown as ArrayBuffer);
  const tag = new Uint8Array((ct as ArrayBuffer).slice((ct as ArrayBuffer).byteLength - 16));
  return { wrapped: new Uint8Array(ct), iv, tag };
}

export async function unwrapDEK(ek: CryptoKey, wrapped: Uint8Array, iv: Uint8Array) {
  const raw = await wc.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as ArrayBuffer }, ek, wrapped as unknown as ArrayBuffer);
  return wc.subtle.importKey('raw', raw as unknown as ArrayBuffer, 'AES-GCM', true, ['encrypt','decrypt']);
}

export async function encryptWithDEK(dek: CryptoKey, plaintext: Uint8Array) {
  const iv = new Uint8Array(randomBytes(12));
  const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as ArrayBuffer }, dek, plaintext as unknown as ArrayBuffer);
  const buf = new Uint8Array(ct as ArrayBuffer);
  const tag = buf.slice(buf.byteLength - 16);
  return { ciphertext: buf, iv, tag };
}

export async function decryptWithDEK(dek: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array) {
  const pt = await wc.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as ArrayBuffer }, dek, ciphertext as unknown as ArrayBuffer);
  return new Uint8Array(pt as ArrayBuffer);
}