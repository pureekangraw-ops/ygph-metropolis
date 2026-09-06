import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

import { initializeTrustedFirstRun, openTrustedBrain } from '../www/trusted/bootstrap.mjs';
import { DB_NAME } from '../../greenfield/browser-store.mjs';
import { deactivateRuntimeSession } from '../../greenfield/runtime-session.mjs';

const RECOVERY_CODE = 'LH-chat-income-ambiguity-recovery-code';
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

async function fixture(t, { sideQueryHandler = null } = {}) {
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
    sideQueryHandler,
  });
  t.after(async () => { session.close(); await resetVault(); });
  return session;
}

async function chat(session, requestId, text) {
  return session.services.chat.dispatch({ requestId, route:'PROVIDER', payload:{ text } });
}

function activeTransactions(state) {
  return Object.values(state?.domains?.LEDGER?.records || {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION');
}

test('วันนี้ได้ 500 pauses for income owner and cannot be overwritten or confirmed before source resolution', async (t) => {
  const session = await fixture(t);
  const before = await session.runtime.readState();

  const first = await chat(session, 'UI-INCOME-AMB-1', 'วันนี้ได้ 500');
  assert.equal(first.status, 'SUCCESS');
  assert.equal(first.result.readback.interactionStatus, 'CLARIFICATION_REQUIRED');
  assert.match(first.result.readback.message, /ร้าน/);
  assert.match(first.result.readback.message, /วิ่ง/);
  assert.match(first.result.readback.message, /อย่างอื่น/);

  const premature = await chat(session, 'UI-INCOME-AMB-2', 'ยืนยัน');
  assert.equal(premature.status, 'SUCCESS');
  assert.equal(premature.result.readback.interactionStatus, 'CLARIFICATION_REQUIRED');

  const overwrite = await chat(session, 'UI-INCOME-AMB-3', 'ได้งาน 350');
  assert.equal(overwrite.status, 'SUCCESS');
  assert.equal(overwrite.result.readback.interactionStatus, 'CLARIFICATION_REQUIRED');
  assert.match(overwrite.result.readback.message, /ร้าน|วิ่ง|อย่างอื่น/);

  const durable = await session.runtime.readState();
  assert.deepEqual(durable.domains, before.domains);
});

test('pending income can answer a non-mutation side query and resume the same 500 flow', async (t) => {
  const sideQueryHandler = async rawText => {
    if (rawText !== 'พรุ่งนี้ฝนตกไหม') return null;
    return {
      status:'SUCCESS',
      readback:{
        interactionStatus:'SIDE_QUERY_ANSWERED',
        message:'พรุ่งนี้มีโอกาสฝนตก',
      },
    };
  };
  const session = await fixture(t, { sideQueryHandler });
  const before = await session.runtime.readState();

  await chat(session, 'UI-SIDE-1', 'วันนี้ได้ 500');
  const side = await chat(session, 'UI-SIDE-2', 'พรุ่งนี้ฝนตกไหม');
  assert.equal(side.status, 'SUCCESS');
  assert.equal(side.result.readback.interactionStatus, 'SIDE_QUERY_ANSWERED');
  assert.equal(side.result.readback.message, 'พรุ่งนี้มีโอกาสฝนตก');

  const afterSide = await session.runtime.readState();
  assert.deepEqual(afterSide.domains, before.domains);

  const resumed = await chat(session, 'UI-SIDE-3', 'ร้าน');
  assert.equal(resumed.status, 'SUCCESS');
  assert.equal(resumed.result.readback.interactionStatus, 'CLARIFICATION_REQUIRED');
  assert.match(resumed.result.readback.message, /ขายสินค้า/);
  assert.match(resumed.result.readback.message, /เงินเข้าร้านอย่างอื่น/);

  const afterResume = await session.runtime.readState();
  assert.deepEqual(afterResume.domains, before.domains);
});

test('วันนี้ได้ 500 → อย่างอื่น prepares OTHER_INCOME and mutates only after typed confirmation', async (t) => {
  const session = await fixture(t);
  await chat(session, 'UI-OTHER-1', 'วันนี้ได้ 500');
  const resolved = await chat(session, 'UI-OTHER-2', 'อย่างอื่น');
  assert.equal(resolved.status, 'SUCCESS');
  assert.equal(resolved.result.readback.interactionStatus, 'CONFIRMATION_REQUIRED');
  assert.equal(resolved.result.readback.preview.amountSatang, 50000);

  const beforeConfirm = await session.runtime.readState();
  assert.equal(activeTransactions(beforeConfirm).length, 0);

  const confirmed = await chat(session, 'UI-OTHER-3', 'ยืนยัน');
  assert.equal(confirmed.status, 'SUCCESS');
  const durable = await session.runtime.readState();
  const tx = activeTransactions(durable).find(record => record.direction === 'IN');
  assert.ok(tx);
  assert.equal(tx.amountSatang, 50000);
  assert.match(String(tx.detail || ''), /OTHER_INCOME/);
  assert.equal(Object.values(durable.domains.RIDE.records || {}).length, 0);
});

test('วันนี้ได้ 500 → ร้าน asks sale-vs-non-sale instead of guessing STORE_INCOME', async (t) => {
  const session = await fixture(t);
  await chat(session, 'UI-STORE-AMB-1', 'วันนี้ได้ 500');
  const store = await chat(session, 'UI-STORE-AMB-2', 'ร้าน');
  assert.equal(store.status, 'SUCCESS');
  assert.equal(store.result.readback.interactionStatus, 'CLARIFICATION_REQUIRED');
  assert.match(store.result.readback.message, /ขายสินค้า/);
  assert.match(store.result.readback.message, /เงินเข้าร้านอย่างอื่น/);

  const durable = await session.runtime.readState();
  assert.equal(Object.values(durable.domains.STORE.records || {}).length, 0);
  assert.equal(activeTransactions(durable).length, 0);
});
