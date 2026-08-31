import { DB_NAME, DB_VERSION, DB_STORE } from './persistence.mjs';

function requestResult(request, fallbackMessage) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error(fallbackMessage));
  });
}

function transactionResult(transaction, fallbackMessage) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error(fallbackMessage));
    transaction.onabort = () => reject(transaction.error || new Error(fallbackMessage));
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
    openRequest.onblocked = () => reject(new Error('GREENFIELD_DB_OPEN_BLOCKED'));
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error || new Error('GREENFIELD_DB_OPEN_FAILED'));
  });
  db.onversionchange = () => db.close();

  function transactionStore(mode) {
    const transaction = db.transaction(DB_STORE, mode);
    return { transaction, store:transaction.objectStore(DB_STORE) };
  }

  return {
    get(key) {
      const { store } = transactionStore('readonly');
      return requestResult(store.get(key), 'GREENFIELD_DB_READ_FAILED');
    },
    put(key, value) {
      const { transaction, store } = transactionStore('readwrite');
      store.put(value, key);
      return transactionResult(transaction, 'GREENFIELD_DB_WRITE_FAILED');
    },
    putMany(entries) {
      if (!Array.isArray(entries) || entries.length === 0) return Promise.reject(new TypeError('INVALID_GREENFIELD_STORE_ENTRIES'));
      const { transaction, store } = transactionStore('readwrite');
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) {
          transaction.abort();
          return Promise.reject(new TypeError('INVALID_GREENFIELD_STORE_ENTRY'));
        }
        const [key, value] = entry;
        store.put(value, key);
      }
      return transactionResult(transaction, 'GREENFIELD_DB_WRITE_FAILED');
    },
    resetAll() {
      const { transaction, store } = transactionStore('readwrite');
      store.clear();
      return transactionResult(transaction, 'GREENFIELD_DB_RESET_FAILED');
    },
    close() { db.close(); },
  };
}

export { DB_NAME, DB_VERSION, DB_STORE };
