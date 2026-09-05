import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

import { prepareIntentPath } from '../../lighthouse/intent-path-adapter.mjs';
import { initializeTrustedFirstRun, openTrustedBrain } from '../www/trusted/bootstrap.mjs';
import { DB_NAME } from '../../greenfield/browser-store.mjs';
import { deactivateRuntimeSession } from '../../greenfield/runtime-session.mjs';

const RECOVERY_CODE = 'LH-store-intent-recovery-code';
const DEVICE_PIN = '445566';

async function resetVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('TEST_DB_DELETE_FAILED'));
    request.onblocked = () => reject(new Error('TEST_DB_DELETE_BLOCKED'));
  });
}

test('explicit Store sale text prepares a STORE_SALE request without mutating anything', () => {
  const prepared = prepareIntentPath('ขายสบู่ 1 กล่อง 500 บาท', {
    requestIdFactory:() => 'REQ-STORE-TEXT-1',
    receivedAt:'2026-09-05T15:10:00.000Z',
    timeZone:'Asia/Bangkok',
  });

  assert.equal(prepared.status, 'READY');
  assert.equal(prepared.request.object, 'STORE_SALE');
  assert.deepEqual(prepared.request.fields, {
    title:'สบู่',
    amountSatang:50000,
    quantity:1,
    receivedSatang:50000,
  });
  assert.deepEqual(prepared.request.requiredResult, {
    kind:'STORE_SALE_WITH_LEDGER',
    effect:{
      owner:'STORE',
      ledgerDirection:'IN',
      title:'สบู่',
      amountSatang:50000,
      quantity:1,
      receivedSatang:50000,
    },
  });
});

test('Stable CHAT turns explicit Store sale text into conversational confirmation before any business mutation', async (t) => {
  await resetVault();
  await initializeTrustedFirstRun({
    recoveryCode:RECOVERY_CODE,
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    now:() => '2026-09-05T15:12:00.000Z',
  });
  const session = await openTrustedBrain({
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-09-05T15:12:01.000Z',
    documentRef:null,
  });
  t.after(async () => { session.close(); await resetVault(); });

  const before = await session.runtime.readState();
  const first = await session.services.chat.dispatch({
    requestId:'UI-STORE-CONFIRM-FIRST',
    route:'PROVIDER',
    payload:{ text:'ขายสบู่ 1 กล่อง 500 บาท' },
  });

  assert.equal(first.status, 'SUCCESS');
  assert.equal(first.result.readback.interactionStatus, 'CONFIRMATION_REQUIRED');
  assert.match(first.result.readback.message, /สบู่ 500 บาท/);
  const pending = await session.runtime.readState();
  assert.deepEqual(pending.domains, before.domains);
});
