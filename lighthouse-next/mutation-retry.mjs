export const MANUAL_MUTATION_ATTEMPT_PREFIX = 'lighthouse-next-manual-attempt:';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function payloadKey(value) {
  return JSON.stringify(stable(value ?? null));
}

function assertPersistence(storage, key) {
  if (!key) return null;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new TypeError('LIGHTHOUSE_MUTATION_STORAGE_REQUIRED');
  }
  return storage;
}

function restorePending(storage, key, prefixNames) {
  if (!storage || !key) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    if (!parsed || parsed.version !== 1 || parsed.verificationPending !== true || !parsed.ids || typeof parsed.ids !== 'object') return null;
    const ids = {};
    for (const name of prefixNames) {
      const value = String(parsed.ids[name] || '').trim();
      if (!value) return null;
      ids[name] = value;
    }
    return { key:null, payload:null, ids, verificationPending:true, restored:true };
  } catch {
    return null;
  }
}

export function mutationErrorNeedsVerification(error) {
  const code = String(error?.message || error || '').trim();
  if (!code) return true;
  if (code === 'RUNTIME_SESSION_LOCKED') return false;
  if (code.includes('PAYMENT_OVER_REMAINING')) return false;
  if (code.includes('INSUFFICIENT_STOCK')) return false;
  if (code.includes('_REQUIRED') || code.includes('_INVALID') || code.includes('_NOT_ALLOWED')) return false;
  return true;
}

export function createStableMutationAttempt({
  createId,
  prefixes,
  storage = null,
  persistenceKey = null,
} = {}) {
  if (typeof createId !== 'function') throw new TypeError('LIGHTHOUSE_MUTATION_ID_FACTORY_REQUIRED');
  if (!prefixes || typeof prefixes !== 'object' || Array.isArray(prefixes) || !Object.keys(prefixes).length) {
    throw new TypeError('LIGHTHOUSE_MUTATION_PREFIXES_REQUIRED');
  }
  for (const [name, prefix] of Object.entries(prefixes)) {
    if (!String(name || '').trim() || !String(prefix || '').trim()) throw new TypeError('LIGHTHOUSE_MUTATION_PREFIX_INVALID');
  }

  const key = persistenceKey == null ? null : String(persistenceKey).trim();
  const persistentStorage = assertPersistence(storage, key);
  const prefixNames = Object.keys(prefixes);
  let current = restorePending(persistentStorage, key, prefixNames);

  function persistVerificationPending() {
    if (!persistentStorage || !key || !current?.verificationPending) return;
    persistentStorage.setItem(key, JSON.stringify({
      version:1,
      verificationPending:true,
      ids:{ ...current.ids },
    }));
  }

  function acquire(payload) {
    const nextKey = payloadKey(payload);
    if (current?.verificationPending) {
      if (current.key === null) {
        current.key = nextKey;
        current.payload = clone(payload);
        return Object.freeze({ ...current.ids });
      }
      if (current.key !== nextKey) throw new Error('LIGHTHOUSE_MUTATION_RETRY_PAYLOAD_LOCKED');
      return Object.freeze({ ...current.ids });
    }
    if (!current || current.key !== nextKey) {
      current = {
        key:nextKey,
        payload:clone(payload),
        ids:Object.fromEntries(Object.entries(prefixes).map(([name, prefix]) => [name, createId(prefix)])),
        verificationPending:false,
        restored:false,
      };
    }
    return Object.freeze({ ...current.ids });
  }

  function markVerificationPending() {
    if (!current) throw new Error('LIGHTHOUSE_MUTATION_ATTEMPT_REQUIRED');
    current.verificationPending = true;
    persistVerificationPending();
    return snapshot();
  }

  function clear() {
    current = null;
    if (persistentStorage && key) persistentStorage.removeItem(key);
  }

  function snapshot() {
    if (!current) return null;
    return Object.freeze({
      payload:clone(current.payload),
      ids:Object.freeze({ ...current.ids }),
      verificationPending:current.verificationPending,
      restored:current.restored === true,
    });
  }

  return Object.freeze({ acquire, markVerificationPending, clear, snapshot });
}

export function clearStableMutationAttempts({
  storage = globalThis.localStorage,
  prefix = MANUAL_MUTATION_ATTEMPT_PREFIX,
} = {}) {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function' || typeof storage.removeItem !== 'function') return 0;
  const target = String(prefix || MANUAL_MUTATION_ATTEMPT_PREFIX);
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === 'string' && key.startsWith(target)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}
