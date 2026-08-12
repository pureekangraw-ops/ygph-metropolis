"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function minimalEvidence() {
  return {
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-1786527289637',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-08-12T09:34:21.231Z', sourceRevision:28,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[
      {eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:0,calculation:{openingBalanceSatang:0}}},validation:{ownerConfirmation:'UNCONFIRMED'}}
    ]
  };
}

test('runtime facade initializes, executes owner-safe business workflows, and exposes one diagnostic surface', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({ store, passphrase:'correct horse battery staple', lockManager:null, now:()=>'2026-08-12T11:40:00.000Z' });
  const initial = await runtime.initializeFromEvidence(minimalEvidence(), { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
  assert.equal(initial.status, 'IMPORTED_VERIFIED');
  assert.deepEqual(runtime.diagnostics(), {
    architecture:'GREENFIELD', schema:1, database:'ygph-metropolis-greenfield-secure', vault:'ygph-metropolis-greenfield-vault', coordination:{mode:'LOCAL_QUEUE',crossContextSafety:'LIMITED'}
  });
  const result = await runtime.sale({ workflowId:'SALE-WF', saleId:'SALE1', ledgerTransactionId:'TX1', title:'ขายเงินสด', amountSatang:10000, quantity:1, receivedSatang:10000 });
  assert.equal(result.status, 'VERIFIED');
  assert.equal((await runtime.readState()).revision, 4);
  assert.equal(runtime.project().ledgerBalanceSatang, 10000);
  assert.equal(runtime.project().calendar.total, 0);
});

test('runtime facade backup round-trip restores into a fresh runtime without exposing legacy DB', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const firstStore = createMemoryVaultStore();
  const first = createGreenfieldRuntime({ store:firstStore, passphrase:'correct horse battery staple', lockManager:null });
  await first.initializeFromEvidence(minimalEvidence(), { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
  await first.otherIncome({ workflowId:'IN-WF', ledgerTransactionId:'TX-IN', title:'รายรับอื่น', amountSatang:7500 });
  const backup = await first.exportBackup();
  assert.equal(JSON.stringify(backup).includes('stock-pocket-secure'), false);
  const secondStore = createMemoryVaultStore();
  const second = createGreenfieldRuntime({ store:secondStore, passphrase:'correct horse battery staple', lockManager:null });
  const restored = await second.restoreBackup(backup);
  assert.equal(restored.status, 'VERIFIED');
  assert.equal(second.project().ledgerBalanceSatang, 7500);
});

test('browser factory opens only greenfield browser store and never references legacy storage', async () => {
  const { openGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  let openedName = null;
  const stores = new Map();
  const db = {
    objectStoreNames:{contains:name=>stores.has(name)}, createObjectStore(name){stores.set(name,new Map());}, close(){},
    transaction(name){const map=stores.get(name);return {objectStore(){return {
      get(key){const req={};queueMicrotask(()=>{req.result=structuredClone(map.get(key)??null);req.onsuccess?.();});return req;},
      put(value,key){const req={};queueMicrotask(()=>{map.set(key,structuredClone(value));req.result=key;req.onsuccess?.();});return req;}
    };}};}
  };
  const indexedDBImpl={open(name){openedName=name;const req={};queueMicrotask(()=>{req.result=db;req.onupgradeneeded?.();req.onsuccess?.();});return req;}};
  const runtime = await openGreenfieldRuntime({ passphrase:'correct horse battery staple', indexedDBImpl, lockManager:null });
  assert.equal(openedName, 'ygph-metropolis-greenfield-secure');
  assert.equal(runtime.diagnostics().database, 'ygph-metropolis-greenfield-secure');
  runtime.close();
});
