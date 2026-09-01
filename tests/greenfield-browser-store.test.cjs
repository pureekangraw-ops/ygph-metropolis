"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeIndexedDb() {
  const stores = new Map();
  let opened = null;
  let lastDb = null;
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { if (!stores.has(name)) stores.set(name, new Map()); },
    transaction(name) {
      const map = stores.get(name);
      if (!map) throw new Error(`missing store ${name}`);
      let pending = 0;
      let aborted = false;
      const transaction = {
        error:null,
        objectStore() { return {
          get(key) {
            const request = {};
            queueMicrotask(() => {
              if (aborted) return;
              request.result = structuredClone(map.get(key) ?? null);
              request.onsuccess?.();
            });
            return request;
          },
          put(value, key) {
            const request = {};
            pending += 1;
            queueMicrotask(() => {
              if (aborted) return;
              map.set(key, structuredClone(value));
              request.result = key;
              request.onsuccess?.();
              pending -= 1;
              if (pending === 0) queueMicrotask(() => transaction.oncomplete?.());
            });
            return request;
          },
          clear() {
            const request = {};
            pending += 1;
            queueMicrotask(() => {
              if (aborted) return;
              map.clear();
              request.onsuccess?.();
              pending -= 1;
              if (pending === 0) queueMicrotask(() => transaction.oncomplete?.());
            });
            return request;
          }
        }; },
        abort() {
          aborted = true;
          queueMicrotask(() => transaction.onabort?.());
        },
      };
      return transaction;
    },
    close() { db.closed = true; }
  };
  lastDb = db;
  return {
    get opened() { return opened; },
    get db() { return lastDb; },
    open(name, version) {
      opened = { name, version };
      const request = {};
      queueMicrotask(() => { request.result = db; request.onupgradeneeded?.(); request.onsuccess?.(); });
      return request;
    }
  };
}

test('browser store opens only the new greenfield DB and supports durable get/put', async () => {
  const { DB_NAME, DB_VERSION, DB_STORE, openGreenfieldVaultStore } = await import('../greenfield/browser-store.mjs');
  const indexedDBImpl = fakeIndexedDb();
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  assert.deepEqual(indexedDBImpl.opened, { name: DB_NAME, version: DB_VERSION });
  await store.put('current', { hello: 'world' });
  assert.deepEqual(await store.get('current'), { hello: 'world' });
  assert.equal(DB_STORE, 'vault');
  store.close();
});

test('browser store resolves single writes only after the transaction commits', async () => {
  const { openGreenfieldVaultStore } = await import('../greenfield/browser-store.mjs');
  let requestSucceeded = false;
  let transactionCompleted = false;
  const indexedDBImpl = {
    open() {
      const openRequest = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames:{ contains:() => true },
          transaction() {
            const transaction = {
              objectStore() { return { put() {
                const request = {};
                queueMicrotask(() => {
                  requestSucceeded = true;
                  request.result = 'current';
                  request.onsuccess?.();
                  queueMicrotask(() => {
                    transactionCompleted = true;
                    transaction.oncomplete?.();
                  });
                });
                return request;
              } }; },
            };
            return transaction;
          },
          close() {},
        };
        openRequest.result = db;
        openRequest.onsuccess?.();
      });
      return openRequest;
    },
  };
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  await store.put('current', { hello:'world' });
  assert.equal(requestSucceeded, true);
  assert.equal(transactionCompleted, true);
  store.close();
});

test('browser store closes an old connection on versionchange so upgrades are not stranded', async () => {
  const { openGreenfieldVaultStore } = await import('../greenfield/browser-store.mjs');
  const indexedDBImpl = fakeIndexedDb();
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  assert.equal(typeof indexedDBImpl.db.onversionchange, 'function');
  indexedDBImpl.db.onversionchange();
  assert.equal(indexedDBImpl.db.closed, true);
  store.close();
});

test('browser store fails closed when opening is blocked by another connection', async () => {
  const { openGreenfieldVaultStore } = await import('../greenfield/browser-store.mjs');
  const indexedDBImpl = {
    open() {
      const request = {};
      queueMicrotask(() => request.onblocked?.());
      return request;
    },
  };
  await assert.rejects(openGreenfieldVaultStore({ indexedDBImpl }), /GREENFIELD_DB_OPEN_BLOCKED/);
});

test('browser store commits multiple credential entries through one transaction', async () => {
  const { openGreenfieldVaultStore } = await import('../greenfield/browser-store.mjs');
  const store = await openGreenfieldVaultStore({ indexedDBImpl:fakeIndexedDb() });
  await store.putMany([
    ['device-unlock:key:v1', { key:'value' }],
    ['device-unlock:credential:v1', { credential:'value' }],
  ]);
  assert.deepEqual(await store.get('device-unlock:key:v1'), { key:'value' });
  assert.deepEqual(await store.get('device-unlock:credential:v1'), { credential:'value' });
  store.close();
});

test('browser store refuses to run without IndexedDB', async () => {
  const { openGreenfieldVaultStore } = await import('../greenfield/browser-store.mjs');
  await assert.rejects(openGreenfieldVaultStore({ indexedDBImpl: null }), /INDEXEDDB_UNAVAILABLE/);
});
