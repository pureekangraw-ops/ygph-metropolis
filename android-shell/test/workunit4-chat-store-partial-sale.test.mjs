import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

import { initializeTrustedFirstRun, openTrustedBrain } from '../www/trusted/bootstrap.mjs';
import { DB_NAME } from '../../greenfield/browser-store.mjs';
import { deactivateRuntimeSession } from '../../greenfield/runtime-session.mjs';

const RECOVERY_CODE = 'LH-chat-store-partial-sale-recovery-code';
const DEVICE_PIN = '778899';

async function resetVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('TEST_DB_DELETE_FAILED'));
    request.onblocked = () => reject(new Error('TEST_DB_DELETE_BLOCKED'));
  });
}

async function fixture(t) {
  await resetVault();
  await initializeTrustedFirstRun({
    recoveryCode:RECOVERY_CODE,
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    now:() => '2026-09-06T04:30:00.000Z',
  });
  const session = await openTrustedBrain({
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-09-06T04:30:01.000Z',
    documentRef:null,
  });
  t.after(async () => { session.close(); await resetVault(); });
  return session;
}

async function chat(session, requestId, text) {
  return session.services.chat.dispatch({ requestId, route:'PROVIDER', payload:{ text } });
}

function storeRecords(state) {
  return Object.values(state?.domains?.STORE?.records || {}).map(entry => entry?.record);
}

function ledgerTransactions(state) {
  return Object.values(state?.domains?.LEDGER?.records || {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION');
}

test('Store sale retains a partial product name and asks only for quantity before confirmation', async (t) => {
  const session = await fixture(t);

  await chat(session, 'UI-STORE-PARTIAL-1', 'วันนี้ได้ 500');
  await chat(session, 'UI-STORE-PARTIAL-2', 'ร้าน');
  await chat(session, 'UI-STORE-PARTIAL-3', 'ขายสินค้า');

  const productOnly = await chat(session, 'UI-STORE-PARTIAL-4', 'สบู่');
  assert.equal(productOnly.status, 'SUCCESS');
  assert.equal(productOnly.result.readback.interactionStatus, 'CLARIFICATION_REQUIRED');
  assert.match(productOnly.result.readback.message, /สบู่/);
  assert.match(productOnly.result.readback.message, /จำนวน/);

  const beforeQuantity = await session.runtime.readState();
  assert.equal(storeRecords(beforeQuantity).length, 0);
  assert.equal(ledgerTransactions(beforeQuantity).length, 0);

  const quantityOnly = await chat(session, 'UI-STORE-PARTIAL-5', '1 กล่อง');
  assert.equal(quantityOnly.status, 'SUCCESS');
  assert.equal(quantityOnly.result.readback.interactionStatus, 'CONFIRMATION_REQUIRED');
  assert.equal(quantityOnly.result.readback.preview.title, 'สบู่');
  assert.equal(quantityOnly.result.readback.preview.amountSatang, 50000);

  const beforeConfirm = await session.runtime.readState();
  assert.equal(storeRecords(beforeConfirm).length, 0);
  assert.equal(ledgerTransactions(beforeConfirm).length, 0);
});
