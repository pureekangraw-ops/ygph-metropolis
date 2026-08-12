import { DB_NAME, DB_VERSION, DB_STORE } from './persistence.mjs';

function requestResult(request, fallbackMessage) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error(fallbackMessage));
  });
}

export async function openGreenfieldVaultStore({ indexedDBImpl = globalThis.indexedDB } = {}) {
  if (!indexedDBImpl || typeof indexedDBImpl.open !== 'function') throw new Error('INDEXEDDB_UNAVAILABLE');
  const openRequest = indexedDBImpl.open(DB_NAME, DB_VERSION);
  const db = await new Promise((resolve, reject) => {
    openRequest.onupgradeneeded = () => {
      const result = openRequest.result;
      if (!result.objectStoreNames.contains(DB_STORE)) result.createObjectStore(DB_STORE);
    };
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error || new Error('GREENFIELD_DB_OPEN_FAILED'));
  });

  function objectStore(mode) {
    return db.transaction(DB_STORE, mode).objectStore(DB_STORE);
  }

  return {
    get(key) { return requestResult(objectStore('readonly').get(key), 'GREENFIELD_DB_READ_FAILED'); },
    put(key, value) { return requestResult(objectStore('readwrite').put(value, key), 'GREENFIELD_DB_WRITE_FAILED'); },
    close() { db.close(); },
  };
}

export { DB_NAME, DB_VERSION, DB_STORE };
