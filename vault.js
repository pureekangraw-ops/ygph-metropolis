import {
  DB_NAME,
  DB_STORE,
  DB_VERSION,
  PBKDF2_ITERATIONS,
  VAULT_KEY,
  VAULT_VERSION,
  stableStringify,
  normalizeState,
  validateState,
} from './core.js';

const AAD_TEXT = 'stock-pocket-secure-v1';
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

export async function deriveVaultKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  if (String(passphrase).length < 8) throw new Error('รหัสต้องมีอย่างน้อย 8 ตัวอักษร');
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(String(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations,
  }, material, {
    name: 'AES-GCM',
    length: 256,
  }, false, ['encrypt', 'decrypt']);
}

async function encryptWithKey(state, key, kdf) {
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(state));
  const ciphertext = await globalThis.crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(AAD_TEXT),
    tagLength: 128,
  }, key, plaintext);
  return {
    format: 'stock-pocket-vault',
    version: VAULT_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: Number(kdf.iterations),
      salt: kdf.salt,
    },
    cipher: {
      name: 'AES-GCM',
      iv: bytesToBase64(iv),
      tagLength: 128,
    },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptWithKey(vault, key) {
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: base64ToBytes(vault.cipher.iv),
      additionalData: encoder.encode(AAD_TEXT),
      tagLength: Number(vault.cipher.tagLength || 128),
    }, key, base64ToBytes(vault.ciphertext));
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('ปลดล็อกข้อมูลไม่ได้');
  }
}

export function validateVaultEnvelope(vault) {
  const errors = [];
  if (!vault || typeof vault !== 'object') return { ok: false, errors: ['Vault ไม่ถูกต้อง'] };
  if (vault.format !== 'stock-pocket-vault') errors.push('รูปแบบ Vault ไม่ถูกต้อง');
  if (vault.version !== VAULT_VERSION) errors.push(`รองรับ Vault version ${VAULT_VERSION} เท่านั้น`);
  if (vault.kdf?.name !== 'PBKDF2') errors.push('KDF ต้องเป็น PBKDF2');
  if (vault.kdf?.hash !== 'SHA-256') errors.push('KDF hash ต้องเป็น SHA-256');
  if (Number(vault.kdf?.iterations) !== PBKDF2_ITERATIONS) errors.push(`PBKDF2 iterations ต้องเป็น ${PBKDF2_ITERATIONS}`);
  try {
    if (base64ToBytes(vault.kdf?.salt || '').length < 16) errors.push('Salt สั้นเกินไป');
  } catch { errors.push('Salt ไม่ใช่ base64'); }
  if (vault.cipher?.name !== 'AES-GCM') errors.push('Cipher ต้องเป็น AES-GCM');
  try {
    if (base64ToBytes(vault.cipher?.iv || '').length !== 12) errors.push('IV ต้องยาว 12 bytes');
  } catch { errors.push('IV ไม่ใช่ base64'); }
  if (Number(vault.cipher?.tagLength) !== 128) errors.push('GCM tagLength ต้องเป็น 128');
  if (!vault.ciphertext) errors.push('ไม่มี ciphertext');
  return { ok: errors.length === 0, errors };
}

export async function createVault(passphrase, state) {
  const validation = validateState(state);
  if (!validation.ok) throw new Error(validation.errors.join('\n'));
  const salt = randomBytes(16);
  const kdf = {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
  };
  const key = await deriveVaultKey(passphrase, salt, kdf.iterations);
  const vault = await encryptWithKey(state, key, kdf);
  return { vault, key, state };
}

export async function unlockVault(vault, passphrase) {
  const envelope = validateVaultEnvelope(vault);
  if (!envelope.ok) throw new Error(envelope.errors.join('\n'));
  const key = await deriveVaultKey(passphrase, base64ToBytes(vault.kdf.salt), vault.kdf.iterations);
  const state = normalizeState(await decryptWithKey(vault, key));
  const validation = validateState(state);
  if (!validation.ok) throw new Error(`ข้อมูลใน Vault ไม่ผ่านการตรวจ: ${validation.errors.join(', ')}`);
  return { state, key, vault };
}

export function createMemoryVaultStore() {
  const map = new Map();
  return {
    async get(key) { return structuredClone(map.get(key) ?? null); },
    async put(key, value) { map.set(key, structuredClone(value)); },
    async close() {},
  };
}

export async function openVaultStore() {
  if (!globalThis.indexedDB) throw new Error('อุปกรณ์นี้ไม่รองรับ IndexedDB');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('เปิดฐานข้อมูลไม่ได้'));
  });
  const transaction = mode => db.transaction(DB_STORE, mode).objectStore(DB_STORE);
  return {
    get(key) {
      return new Promise((resolve, reject) => {
        const request = transaction('readonly').get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error || new Error('อ่านฐานข้อมูลไม่ได้'));
      });
    },
    put(key, value) {
      return new Promise((resolve, reject) => {
        const request = transaction('readwrite').put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('บันทึกฐานข้อมูลไม่ได้'));
      });
    },
    close() { db.close(); },
  };
}

export async function commitState({ store, key, proposed, action = 'UNKNOWN' }) {
  const validation = validateState(proposed);
  if (!validation.ok) throw new Error(validation.errors.join('\n'));
  const currentVault = await store.get(VAULT_KEY);
  if (!currentVault) throw new Error('ไม่พบ Vault เดิม');
  const envelope = validateVaultEnvelope(currentVault);
  if (!envelope.ok) throw new Error(envelope.errors.join('\n'));
  const vault = await encryptWithKey(proposed, key, currentVault.kdf);
  await store.put(VAULT_KEY, vault);
  const durableVault = await store.get(VAULT_KEY);
  const durableState = await decryptWithKey(durableVault, key);
  if (stableStringify(durableState) !== stableStringify(proposed)) {
    throw new Error('ตรวจข้อมูลหลังบันทึกไม่ผ่าน');
  }
  return {
    status: 'COMMITTED',
    action,
    revision: proposed.revision,
    committedAt: new Date().toISOString(),
  };
}

export async function saveNewVault(store, passphrase, state) {
  const created = await createVault(passphrase, state);
  await store.put(VAULT_KEY, created.vault);
  const durable = await store.get(VAULT_KEY);
  const unlocked = await unlockVault(durable, passphrase);
  if (stableStringify(unlocked.state) !== stableStringify(state)) throw new Error('ตรวจ Vault หลังสร้างไม่ผ่าน');
  return created;
}

export async function exportEncryptedBackup(store, releaseVersion = '0.1.0-preview.1') {
  const vault = await store.get(VAULT_KEY);
  if (!vault) throw new Error('ไม่พบ Vault');
  return {
    backupFormat: 'stock-pocket-encrypted-backup',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    releaseVersion,
    vault,
  };
}

export async function importEncryptedBackup(store, backup, passphrase) {
  if (backup?.backupFormat !== 'stock-pocket-encrypted-backup' || backup?.backupVersion !== 1 || !backup.vault) {
    throw new Error('ไฟล์สำรองไม่ถูกต้อง');
  }
  const unlocked = await unlockVault(backup.vault, passphrase);
  await store.put(VAULT_KEY, backup.vault);
  const durable = await store.get(VAULT_KEY);
  const checked = await unlockVault(durable, passphrase);
  if (stableStringify(checked.state) !== stableStringify(unlocked.state)) throw new Error('ตรวจข้อมูลนำเข้าไม่ผ่าน');
  return unlocked;
}
