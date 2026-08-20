"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('browser store resetAll clears every Greenfield vault entry', async () => {
  const { openGreenfieldVaultStore } = await import('../greenfield/browser-store.mjs');
  const map = new Map();
  const db = {
    objectStoreNames:{ contains:()=>true },
    transaction(){
      const tx={ error:null, objectStore(){ return {
        get(key){ const r={}; queueMicrotask(()=>{ r.result=map.get(key) ?? null; r.onsuccess?.(); }); return r; },
        put(value,key){ const r={}; queueMicrotask(()=>{ map.set(key,value); r.result=key; r.onsuccess?.(); tx.oncomplete?.(); }); return r; },
        clear(){ const r={}; queueMicrotask(()=>{ map.clear(); r.result=undefined; r.onsuccess?.(); tx.oncomplete?.(); }); return r; },
      }; } };
      return tx;
    },
    close(){}
  };
  const indexedDBImpl={ open(){ const r={}; queueMicrotask(()=>{ r.result=db; r.onsuccess?.(); }); return r; } };
  const store=await openGreenfieldVaultStore({ indexedDBImpl });
  await store.put('current',{state:true});
  await store.put('device-unlock:key:v1',{key:true});
  await store.put('device-unlock:credential:v1',{credential:true});
  await store.resetAll();
  assert.equal(await store.get('current'), null);
  assert.equal(await store.get('device-unlock:key:v1'), null);
  assert.equal(await store.get('device-unlock:credential:v1'), null);
});
