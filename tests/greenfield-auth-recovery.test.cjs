"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

const RECOVERY_CODE = 'correct horse battery staple';
const OLD_PASSWORD = 'old-password';
const NEW_PASSWORD = 'new-password';

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-1786527289637',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-08-12T09:34:21.231Z', sourceRevision:28,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[
      {eventId:'S0',source:'STORE',owner:'STORE',payload:{record:{recordId:'PURCHASE-BASE',type:'PURCHASE',title:'stock baseline',amountSatang:10000,quantity:1,status:'ACTIVE'}},validation:{ownerConfirmation:'UNCONFIRMED'}},
      {eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:2500,calculation:{openingBalanceSatang:2500}}},validation:{ownerConfirmation:'UNCONFIRMED'}}
    ]
  });
}

function createFakeIndexedDB() {
  const stores = new Map();
  let writes = 0;
  const db = {
    objectStoreNames:{contains:name=>stores.has(name)},
    createObjectStore(name){stores.set(name,new Map());},
    close(){},
    transaction(name){
      const map = stores.get(name);
      let pending = 0;
      let aborted = false;
      const transaction = {
        error:null,
        objectStore(){return {
          get(key){
            const req={};
            queueMicrotask(()=>{if(aborted)return;req.result=structuredClone(map.get(key)??null);req.onsuccess?.();});
            return req;
          },
          put(value,key){
            const req={};
            pending += 1;
            queueMicrotask(()=>{
              if(aborted)return;
              map.set(key,structuredClone(value));
              writes += 1;
              req.result=key;
              req.onsuccess?.();
              pending -= 1;
              if(pending===0)queueMicrotask(()=>transaction.oncomplete?.());
            });
            return req;
          }
        };},
        abort(){aborted=true;queueMicrotask(()=>transaction.onabort?.());}
      };
      return transaction;
    }
  };
  const indexedDBImpl={
    open(){
      const req={};
      queueMicrotask(()=>{
        req.result=db;
        if(!stores.has('vault'))req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    }
  };
  return {
    indexedDBImpl,
    writes:()=>writes,
    raw:key=>structuredClone(stores.get('vault')?.get(key)??null),
  };
}

async function initializedFixture() {
  const {
    openGreenfieldRuntime,
    enrollGreenfieldDeviceUnlock,
  } = await import('../greenfield/runtime.mjs');
  const fake = createFakeIndexedDB();
  const runtime = await openGreenfieldRuntime({ passphrase:RECOVERY_CODE, indexedDBImpl:fake.indexedDBImpl, lockManager:null, now:()=>'2026-08-13T05:00:00.000Z' });
  const imported = await runtime.initializeFromEvidence(minimalEvidence(), { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
  const expectedRevision = imported.state.revision;
  runtime.close();
  await enrollGreenfieldDeviceUnlock({ vaultPassphrase:RECOVERY_CODE, pin:OLD_PASSWORD, indexedDBImpl:fake.indexedDBImpl });
  return { fake, expectedRevision, vaultBefore:fake.raw('current') };
}

test('Recovery Code verifies against the existing Vault without exposing business data', async () => {
  const { verifyGreenfieldRecoveryCode } = await import('../greenfield/runtime.mjs');
  const { fake } = await initializedFixture();

  assert.deepEqual(
    await verifyGreenfieldRecoveryCode({ recoveryCode:RECOVERY_CODE, indexedDBImpl:fake.indexedDBImpl }),
    { status:'VERIFIED' },
  );
  await assert.rejects(
    () => verifyGreenfieldRecoveryCode({ recoveryCode:'wrong recovery code value', indexedDBImpl:fake.indexedDBImpl }),
    /GREENFIELD_VAULT_DECRYPT_FAILED/,
  );
});

test('valid Recovery Code resets only the everyday password and preserves the existing Vault', async () => {
  const {
    resetGreenfieldDevicePassword,
    openGreenfieldRuntimeWithDevicePin,
  } = await import('../greenfield/runtime.mjs');
  const { fake, expectedRevision, vaultBefore } = await initializedFixture();

  assert.deepEqual(
    await resetGreenfieldDevicePassword({ recoveryCode:RECOVERY_CODE, nextPassword:NEW_PASSWORD, indexedDBImpl:fake.indexedDBImpl }),
    { status:'RESET' },
  );

  await assert.rejects(
    () => openGreenfieldRuntimeWithDevicePin({ pin:OLD_PASSWORD, indexedDBImpl:fake.indexedDBImpl, lockManager:null }),
    /DEVICE_PIN_INVALID/,
  );
  const reopened = await openGreenfieldRuntimeWithDevicePin({ pin:NEW_PASSWORD, indexedDBImpl:fake.indexedDBImpl, lockManager:null });
  const state = await reopened.readState();
  assert.equal(state.revision, expectedRevision);
  assert.equal(reopened.project().ledgerBalanceSatang, 2500);
  reopened.close();
  assert.deepEqual(fake.raw('current'), vaultBefore);
});

test('invalid Recovery Code performs zero durable writes and preserves existing credentials', async () => {
  const {
    resetGreenfieldDevicePassword,
    openGreenfieldRuntimeWithDevicePin,
  } = await import('../greenfield/runtime.mjs');
  const { fake, expectedRevision, vaultBefore } = await initializedFixture();
  const writesBefore = fake.writes();

  await assert.rejects(
    () => resetGreenfieldDevicePassword({ recoveryCode:'wrong recovery code value', nextPassword:NEW_PASSWORD, indexedDBImpl:fake.indexedDBImpl }),
    /GREENFIELD_VAULT_DECRYPT_FAILED/,
  );

  assert.equal(fake.writes(), writesBefore);
  assert.deepEqual(fake.raw('current'), vaultBefore);
  const reopened = await openGreenfieldRuntimeWithDevicePin({ pin:OLD_PASSWORD, indexedDBImpl:fake.indexedDBImpl, lockManager:null });
  const state = await reopened.readState();
  assert.equal(state.revision, expectedRevision);
  assert.equal(reopened.project().ledgerBalanceSatang, 2500);
  reopened.close();
});
