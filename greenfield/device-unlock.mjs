import { readEncryptedState } from './persistence.mjs';

export const DEVICE_UNLOCK_KEY = 'device-unlock:key:v1';
export const DEVICE_UNLOCK_CREDENTIAL = 'device-unlock:credential:v1';
export const DEVICE_UNLOCK_FORMAT = 'ygph-metropolis-device-unlock';
export const DEVICE_UNLOCK_VERSION = 1;
export const DEVICE_PIN_MIN_LENGTH = 6;
export const DEVICE_PIN_PBKDF2_ITERATIONS = 600000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEVICE_UNLOCK_AAD = encoder.encode('ygph-metropolis-device-unlock-v1');

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('INVALID_DEVICE_UNLOCK_ENCODING');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function pinValue(pin) {
  const value = String(pin ?? '');
  if (value.length < DEVICE_PIN_MIN_LENGTH) throw new Error('DEVICE_PIN_TOO_SHORT');
  return value;
}

function aadForBinding(binding) {
  const result = new Uint8Array(DEVICE_UNLOCK_AAD.length + binding.length);
  result.set(DEVICE_UNLOCK_AAD, 0);
  result.set(binding, DEVICE_UNLOCK_AAD.length);
  return result;
}

async function derivePinBinding(pin, salt) {
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(pinValue(pin)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name:'PBKDF2', hash:'SHA-256', salt, iterations:DEVICE_PIN_PBKDF2_ITERATIONS },
    material,
    256,
  );
  return new Uint8Array(bits);
}

async function generateDeviceKey() {
  return globalThis.crypto.subtle.generateKey(
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt'],
  );
}

function validateDeviceKey(key) {
  if (!key || key.type !== 'secret') throw new Error('INVALID_DEVICE_UNLOCK_KEY');
  if (key.extractable !== false) throw new Error('INVALID_DEVICE_UNLOCK_KEY');
  if (key.algorithm?.name !== 'AES-GCM' || Number(key.algorithm?.length) !== 256) throw new Error('INVALID_DEVICE_UNLOCK_KEY');
  const usages = [...(key.usages || [])].sort();
  if (usages.length !== 2 || usages[0] !== 'decrypt' || usages[1] !== 'encrypt') throw new Error('INVALID_DEVICE_UNLOCK_KEY');
  return key;
}

function validateCredential(credential) {
  if (!credential || typeof credential !== 'object' || Array.isArray(credential)) throw new Error('INVALID_DEVICE_UNLOCK_CREDENTIAL');
  if (credential.format !== DEVICE_UNLOCK_FORMAT || Number(credential.version) !== DEVICE_UNLOCK_VERSION) throw new Error('INVALID_DEVICE_UNLOCK_CREDENTIAL');
  if (credential.pinKdf?.name !== 'PBKDF2' || credential.pinKdf?.hash !== 'SHA-256') throw new Error('INVALID_DEVICE_UNLOCK_KDF');
  if (Number(credential.pinKdf?.iterations) !== DEVICE_PIN_PBKDF2_ITERATIONS) throw new Error('INVALID_DEVICE_UNLOCK_KDF');
  if (credential.cipher?.name !== 'AES-GCM' || Number(credential.cipher?.tagLength) !== 128) throw new Error('INVALID_DEVICE_UNLOCK_CIPHER');
  const salt = base64ToBytes(credential.pinKdf?.salt);
  const iv = base64ToBytes(credential.cipher?.iv);
  const ciphertext = base64ToBytes(credential.ciphertext);
  if (salt.length !== 16) throw new Error('INVALID_DEVICE_UNLOCK_KDF');
  if (iv.length !== 12) throw new Error('INVALID_DEVICE_UNLOCK_CIPHER');
  if (ciphertext.length < 17) throw new Error('INVALID_DEVICE_UNLOCK_CREDENTIAL');
  return { credential, salt, iv, ciphertext };
}

async function sealCredential({ key, vaultPassphrase, pin }) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const binding = await derivePinBinding(pin, salt);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name:'AES-GCM', iv, additionalData:aadForBinding(binding), tagLength:128 },
    validateDeviceKey(key),
    encoder.encode(String(vaultPassphrase)),
  );
  return {
    format:DEVICE_UNLOCK_FORMAT,
    version:DEVICE_UNLOCK_VERSION,
    pinKdf:{ name:'PBKDF2', hash:'SHA-256', iterations:DEVICE_PIN_PBKDF2_ITERATIONS, salt:bytesToBase64(salt) },
    cipher:{ name:'AES-GCM', iv:bytesToBase64(iv), tagLength:128 },
    ciphertext:bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function inspectDeviceUnlock({ store } = {}) {
  if (!store || typeof store.get !== 'function') throw new TypeError('INVALID_GREENFIELD_STORE');
  const [key, credential] = await Promise.all([
    store.get(DEVICE_UNLOCK_KEY),
    store.get(DEVICE_UNLOCK_CREDENTIAL),
  ]);
  if (!key && !credential) return { status:'UNENROLLED' };
  if (!key || !credential) return { status:'INCOMPLETE' };
  return { status:'ENROLLED' };
}

export async function enrollDeviceUnlock({ store, vaultPassphrase, pin } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new TypeError('INVALID_GREENFIELD_STORE');
  pinValue(pin);

  const state = await readEncryptedState({ store, passphrase:vaultPassphrase });
  if (!state) throw new Error('GREENFIELD_NOT_INITIALIZED');

  const existingKey = await store.get(DEVICE_UNLOCK_KEY);
  const key = existingKey ? validateDeviceKey(existingKey) : await generateDeviceKey();
  const credential = await sealCredential({ key, vaultPassphrase, pin });

  await store.put(DEVICE_UNLOCK_KEY, key);
  await store.put(DEVICE_UNLOCK_CREDENTIAL, credential);
  return { status:'ENROLLED' };
}

export async function unlockVaultPassphrase({ store, pin } = {}) {
  if (!store || typeof store.get !== 'function') throw new TypeError('INVALID_GREENFIELD_STORE');
  pinValue(pin);
  const [keyValue, credentialValue] = await Promise.all([
    store.get(DEVICE_UNLOCK_KEY),
    store.get(DEVICE_UNLOCK_CREDENTIAL),
  ]);
  if (!keyValue && !credentialValue) throw new Error('DEVICE_UNLOCK_NOT_ENROLLED');
  if (!keyValue || !credentialValue) throw new Error('DEVICE_UNLOCK_INCOMPLETE');

  const key = validateDeviceKey(keyValue);
  const { salt, iv, ciphertext } = validateCredential(credentialValue);
  const binding = await derivePinBinding(pin, salt);
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name:'AES-GCM', iv, additionalData:aadForBinding(binding), tagLength:128 },
      key,
      ciphertext,
    );
    const passphrase = decoder.decode(plaintext);
    if (passphrase.length < 12) throw new Error('INVALID_DEVICE_UNLOCK_CREDENTIAL');
    return passphrase;
  } catch (error) {
    if (String(error?.message || '').startsWith('INVALID_DEVICE_UNLOCK_')) throw error;
    throw new Error('DEVICE_PIN_INVALID');
  }
}
