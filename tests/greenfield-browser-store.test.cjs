"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeIndexedDb() {
  const stores = new Map();
  let opened = null;
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { if (!stores.has(name)) stores.set(name, new Map()); },
    transaction(name) {
      const map = stores.get(name);
      if (!map) throw new Error(`missing store ${name}`);
      return { objectStore() { return {
        get(key) { const request = {}; queueMicrotask(() => { request.result = structuredClone(map.get(key) ?? null); request.onsuccess?.(); }); return request; },
        put(value, key) { const request = {}; queueMicrotask(() => { map.set(key, structuredClone(value)); request.result = key; request.onsuccess?.(); }); return request; }
      }; } };
    },
    close() {}
  };
  return {
    get opened() { return opened; },
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

test('browser store refuses to run without IndexedDB', async () => {
  const { openGreenfieldVaultStore } = await import('../greenfield/browser-store.mjs');
  await assert.rejects(openGreenfieldVaultStore({ indexedDBImpl: null }), /INDEXEDDB_UNAVAILABLE/);
});
