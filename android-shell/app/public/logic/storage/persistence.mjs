import { canonicalStringify, assertGreenfieldState, migrateGreenfieldState } from '../runtime/core.mjs';

export const LEGACY_DB_NAME = 'stock-pocket-secure';
export const DB_NAME = 'ygph-metropolis-greenfield-secure';
export const DB_VERSION = 1;
export const DB_STORE = 'vault';
export const VAULT_KEY = 'current';
export const VAULT_FORMAT = 'ygph-metropolis-greenfield-vault';
export const VAULT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600000;
const AAD = new TextEncoder().encode('ygph-metropolis-greenfield-secure-v1');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveKey(passphrase, salt, iterations) {
  if (String(passphrase).length < 12) throw new Error('PASSPHRASE_TOO_SHORT');
  const material = await globalThis.crypto.subtle.importKey('raw', encoder.encode(String(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptState(state, passphrase) {
  assertGreenfieldState(state);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, encoder.encode(JSON.stringify(state)));
  return {
    format: VAULT_FORMAT,
    version: VAULT_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv), tagLength: 128 },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptState(vault, passphrase) {
  if (!vault || vault.format !== VAULT_FORMAT || vault.version !== VAULT_VERSION) throw new Error('INVALID_GREENFIELD_VAULT');
  if (vault.kdf?.name !== 'PBKDF2' || vault.kdf?.hash !== 'SHA-256') throw new Error('INVALID_GREENFIELD_KDF');
  if (Number(vault.kdf?.iterations) !== PBKDF2_ITERATIONS) throw new Error('INVALID_GREENFIELD_KDF_ITERATIONS');
  if (vault.cipher?.name !== 'AES-GCM' || Number(vault.cipher?.tagLength) !== 128) throw new Error('INVALID_GREENFIELD_CIPHER');
  const key = await deriveKey(passphrase, base64ToBytes(vault.kdf.salt), PBKDF2_ITERATIONS);
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(vault.cipher.iv), additionalData: AAD, tagLength: 128 }, key, base64ToBytes(vault.ciphertext));
    return migrateGreenfieldState(JSON.parse(decoder.decode(plaintext)));
  } catch (error) {
    if (String(error?.message || '').includes('INVALID_') || String(error?.message || '').includes('UNEXPECTED_DOMAIN')) throw error;
    throw new Error('GREENFIELD_VAULT_DECRYPT_FAILED');
  }
}

export function createMemoryVaultStore() {
  const map = new Map();
  return {
    async get(key) { return structuredClone(map.get(key) ?? null); },
    async put(key, value) { map.set(key, structuredClone(value)); },
    async delete(key) { map.delete(key); },
    async putMany(entries) {
      if (!Array.isArray(entries) || entries.length === 0) throw new TypeError('INVALID_GREENFIELD_STORE_ENTRIES');
      const next = new Map(map);
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('INVALID_GREENFIELD_STORE_ENTRY');
        const [key, value] = entry;
        next.set(key, structuredClone(value));
      }
      map.clear();
      for (const [key, value] of next) map.set(key, value);
    },
  };
}

export async function readEncryptedState({ store, passphrase }) {
  const vault = await store.get(VAULT_KEY);
  if (!vault) return null;
  return decryptState(vault, passphrase);
}

export async function commitEncryptedState({ store, passphrase, state, expectedDurableRevision }) {
  assertGreenfieldState(state);
  const durableBefore = await readEncryptedState({ store, passphrase });
  const observedRevision = durableBefore?.revision ?? null;
  if (observedRevision !== expectedDurableRevision) throw new Error(`STALE_DURABLE_STATE:${expectedDurableRevision}/${observedRevision}`);
  const vault = await encryptState(state, passphrase);
  await store.put(VAULT_KEY, vault);
  const durableAfter = await readEncryptedState({ store, passphrase });
  if (canonicalStringify(durableAfter) !== canonicalStringify(state)) throw new Error('DURABLE_READBACK_MISMATCH');
  return { status: 'VERIFIED', revision: durableAfter.revision };
}
