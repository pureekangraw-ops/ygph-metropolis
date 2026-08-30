import { openGreenfieldVaultStore } from './source/greenfield/browser-store.mjs';
import { unlockVaultPassphrase } from './source/greenfield/device-unlock.mjs';

export const TRUSTED_ERROR_STATISTICS_KEY = 'trusted-error-statistics:v1';
export const TRUSTED_ERROR_STATISTICS_FORMAT = 'lighthouse-trusted-error-statistics';
export const TRUSTED_ERROR_STATISTICS_VERSION = 1;

const PBKDF2_ITERATIONS = 600000;
const MAX_EVENTS = 500;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const aad = encoder.encode('lighthouse-trusted-error-statistics-v1');

function emptyStatistics() {
  return { total:0, byCode:{}, events:[] };
}

function cloneStatistics(value) {
  return structuredClone(value ?? emptyStatistics());
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('TRUSTED_ERROR_STATISTICS_ENCODING_INVALID');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function normalizeEvent(event) {
  const publicCode = Number(event?.publicCode);
  if (!Number.isSafeInteger(publicCode) || publicCode < 100 || publicCode > 999) {
    throw new Error('TRUSTED_ERROR_STATISTICS_CODE_INVALID');
  }
  const required = (name) => {
    const value = String(event?.[name] ?? '').trim();
    if (!value) throw new Error(`TRUSTED_ERROR_STATISTICS_${name.toUpperCase()}_REQUIRED`);
    return value;
  };
  return {
    occurredAt:required('occurredAt'),
    localDate:required('localDate'),
    localTime:required('localTime'),
    command:String(event?.command ?? '').trim().slice(0, 2000),
    publicCode,
    internalReason:required('internalReason').slice(0, 1000),
    stage:required('stage').slice(0, 80),
    appVersion:required('appVersion').slice(0, 80),
  };
}

function validateStatistics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TRUSTED_ERROR_STATISTICS_PAYLOAD_INVALID');
  if (!Number.isSafeInteger(value.total) || value.total < 0) throw new Error('TRUSTED_ERROR_STATISTICS_TOTAL_INVALID');
  if (!value.byCode || typeof value.byCode !== 'object' || Array.isArray(value.byCode)) throw new Error('TRUSTED_ERROR_STATISTICS_BY_CODE_INVALID');
  if (!Array.isArray(value.events)) throw new Error('TRUSTED_ERROR_STATISTICS_EVENTS_INVALID');
  const byCode = {};
  for (const [code, count] of Object.entries(value.byCode)) {
    if (!/^\d{3}$/.test(code) || !Number.isSafeInteger(count) || count < 0) throw new Error('TRUSTED_ERROR_STATISTICS_BY_CODE_INVALID');
    byCode[code] = count;
  }
  return {
    total:value.total,
    byCode,
    events:value.events.map(normalizeEvent).slice(-MAX_EVENTS),
  };
}

function validateEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TRUSTED_ERROR_STATISTICS_ENVELOPE_INVALID');
  if (value.format !== TRUSTED_ERROR_STATISTICS_FORMAT || Number(value.version) !== TRUSTED_ERROR_STATISTICS_VERSION) {
    throw new Error('TRUSTED_ERROR_STATISTICS_ENVELOPE_INVALID');
  }
  if (value.kdf?.name !== 'PBKDF2' || value.kdf?.hash !== 'SHA-256' || Number(value.kdf?.iterations) !== PBKDF2_ITERATIONS) {
    throw new Error('TRUSTED_ERROR_STATISTICS_KDF_INVALID');
  }
  if (value.cipher?.name !== 'AES-GCM' || Number(value.cipher?.tagLength) !== 128) {
    throw new Error('TRUSTED_ERROR_STATISTICS_CIPHER_INVALID');
  }
  const salt = base64ToBytes(value.kdf.salt);
  const iv = base64ToBytes(value.cipher.iv);
  const ciphertext = base64ToBytes(value.ciphertext);
  if (salt.length !== 16) throw new Error('TRUSTED_ERROR_STATISTICS_KDF_INVALID');
  if (iv.length !== 12 || ciphertext.length < 17) throw new Error('TRUSTED_ERROR_STATISTICS_CIPHER_INVALID');
  return { salt, iv, ciphertext };
}

async function deriveKey(passphrase, salt) {
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(String(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name:'PBKDF2', hash:'SHA-256', salt, iterations:PBKDF2_ITERATIONS },
    material,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt'],
  );
}

async function decryptStatistics(envelope, key) {
  if (!envelope) return emptyStatistics();
  const { iv, ciphertext } = validateEnvelope(envelope);
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name:'AES-GCM', iv, additionalData:aad, tagLength:128 },
      key,
      ciphertext,
    );
    return validateStatistics(JSON.parse(decoder.decode(plaintext)));
  } catch (error) {
    if (String(error?.message || '').startsWith('TRUSTED_ERROR_STATISTICS_')) throw error;
    throw new Error('TRUSTED_ERROR_STATISTICS_DECRYPT_FAILED');
  }
}

async function encryptStatistics(statistics, key, salt) {
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(validateStatistics(statistics)));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name:'AES-GCM', iv, additionalData:aad, tagLength:128 },
    key,
    plaintext,
  );
  return {
    format:TRUSTED_ERROR_STATISTICS_FORMAT,
    version:TRUSTED_ERROR_STATISTICS_VERSION,
    kdf:{
      name:'PBKDF2',
      hash:'SHA-256',
      iterations:PBKDF2_ITERATIONS,
      salt:bytesToBase64(salt),
    },
    cipher:{
      name:'AES-GCM',
      iv:bytesToBase64(iv),
      tagLength:128,
    },
    ciphertext:bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function openTrustedErrorStatistics({
  pin,
  indexedDBImpl = globalThis.indexedDB,
} = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  let closed = false;
  try {
    let passphrase = await unlockVaultPassphrase({ store, pin });
    const existing = await store.get(TRUSTED_ERROR_STATISTICS_KEY);
    const salt = existing ? validateEnvelope(existing).salt : randomBytes(16);
    const key = await deriveKey(passphrase, salt);
    passphrase = null;
    let writeTail = Promise.resolve();

    const ensureOpen = () => {
      if (closed) throw new Error('TRUSTED_ERROR_STATISTICS_CLOSED');
    };

    async function readCurrent() {
      ensureOpen();
      const envelope = await store.get(TRUSTED_ERROR_STATISTICS_KEY);
      return decryptStatistics(envelope, key);
    }

    async function record(event) {
      const normalized = normalizeEvent(event);
      const operation = writeTail.then(async () => {
        ensureOpen();
        const current = await readCurrent();
        const code = String(normalized.publicCode);
        const next = {
          total:current.total + 1,
          byCode:{ ...current.byCode, [code]:(current.byCode[code] ?? 0) + 1 },
          events:[...current.events, normalized].slice(-MAX_EVENTS),
        };
        const envelope = await encryptStatistics(next, key, salt);
        await store.put(TRUSTED_ERROR_STATISTICS_KEY, envelope);
        const readback = await readCurrent();
        if (readback.total !== next.total || readback.byCode[code] !== next.byCode[code]) {
          throw new Error('TRUSTED_ERROR_STATISTICS_READBACK_MISMATCH');
        }
        return cloneStatistics(readback);
      });
      writeTail = operation.catch(() => {});
      return operation;
    }

    async function read() {
      await writeTail;
      return cloneStatistics(await readCurrent());
    }

    return Object.freeze({
      record,
      read,
      close() {
        if (closed) return;
        closed = true;
        store.close();
      },
    });
  } catch (error) {
    store.close();
    throw error;
  }
}
