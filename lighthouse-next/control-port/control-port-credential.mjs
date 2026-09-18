export const LIGHTHOUSE_HUB_CREDENTIAL_DB = 'lighthouse-hub-control-port-v1';
export const LIGHTHOUSE_HUB_CREDENTIAL_KEY = 'paired-hub';
export const LIGHTHOUSE_HUB_CONTRACT = 'lighthouse-control-port-v1';

const ALLOWED_KEYS = new Set([
  'ok', 'session_id', 'session_token', 'expires_at', 'device_label', 'hub_origin', 'contract',
]);

function clean(value) { return String(value == null ? '' : value).trim(); }

function normalizeOrigin(value) {
  const text = clean(value);
  let url;
  try { url = new URL(text); } catch { throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_INVALID'); }
  const localDev = url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localDev) throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_INVALID');
  if (url.origin !== text || url.username || url.password) throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_INVALID');
  return url.origin;
}

export function parseLighthouseHubBootstrap(input) {
  let value = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); } catch { throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_INVALID'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_INVALID');
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_UNEXPECTED_FIELD');
  }
  const contract = clean(value.contract);
  const sessionId = clean(value.session_id);
  const sessionToken = clean(value.session_token);
  const expiresAt = Number(value.expires_at);
  if (contract !== LIGHTHOUSE_HUB_CONTRACT) throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_CONTRACT_MISMATCH');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(sessionId)) throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_INVALID');
  if (!/^[A-Fa-f0-9]{64}$/.test(sessionToken)) throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_INVALID');
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) throw new Error('LIGHTHOUSE_HUB_BOOTSTRAP_INVALID');

  return Object.freeze({
    contract,
    hubOrigin:normalizeOrigin(value.hub_origin),
    sessionId,
    sessionToken,
    expiresAt,
    deviceLabel:clean(value.device_label) || 'LIGHTHOUSE Android',
  });
}

export function createMemoryLighthouseHubCredentialStore(initial = null) {
  let current = initial ? structuredClone(initial) : null;
  return Object.freeze({
    async load() { return current ? structuredClone(current) : null; },
    async save(value) { current = structuredClone(value); return structuredClone(current); },
    async clear() { current = null; },
  });
}

function openCredentialDb(indexedDBImpl) {
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(LIGHTHOUSE_HUB_CREDENTIAL_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('credentials')) db.createObjectStore('credentials');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('LIGHTHOUSE_HUB_CREDENTIAL_DB_OPEN_FAILED'));
  });
}

function requestResult(request, code) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(code));
  });
}

export function createIndexedDbLighthouseHubCredentialStore({ indexedDBImpl = globalThis.indexedDB } = {}) {
  if (!indexedDBImpl || typeof indexedDBImpl.open !== 'function') {
    throw new Error('LIGHTHOUSE_HUB_CREDENTIAL_STORAGE_UNAVAILABLE');
  }

  async function withStore(mode, operation) {
    const db = await openCredentialDb(indexedDBImpl);
    try {
      const tx = db.transaction('credentials', mode);
      const store = tx.objectStore('credentials');
      const completed = new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('LIGHTHOUSE_HUB_CREDENTIAL_DB_ABORTED'));
        tx.onerror = () => reject(tx.error || new Error('LIGHTHOUSE_HUB_CREDENTIAL_DB_FAILED'));
      });
      const result = await operation(store);
      await completed;
      return result;
    } finally {
      db.close();
    }
  }

  return Object.freeze({
    async load() {
      return withStore('readonly', async store => {
        const value = await requestResult(store.get(LIGHTHOUSE_HUB_CREDENTIAL_KEY), 'LIGHTHOUSE_HUB_CREDENTIAL_READ_FAILED');
        return value ? Object.freeze(structuredClone(value)) : null;
      });
    },
    async save(value) {
      const credential = parseLighthouseHubBootstrap({
        contract:value?.contract,
        hub_origin:value?.hubOrigin,
        session_id:value?.sessionId,
        session_token:value?.sessionToken,
        expires_at:value?.expiresAt,
        device_label:value?.deviceLabel,
      });
      await withStore('readwrite', async store => {
        await requestResult(store.put(structuredClone(credential), LIGHTHOUSE_HUB_CREDENTIAL_KEY), 'LIGHTHOUSE_HUB_CREDENTIAL_WRITE_FAILED');
      });
      return credential;
    },
    async clear() {
      await withStore('readwrite', async store => {
        await requestResult(store.delete(LIGHTHOUSE_HUB_CREDENTIAL_KEY), 'LIGHTHOUSE_HUB_CREDENTIAL_DELETE_FAILED');
      });
    },
  });
}
