import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

import { initializeTrustedFirstRun, openTrustedBrain } from '../www/trusted/bootstrap.mjs';
import { DB_NAME } from '../../greenfield/browser-store.mjs';
import { deactivateRuntimeSession } from '../../greenfield/runtime-session.mjs';

const RECOVERY_CODE = 'LH-chat-ride-open-behavior-recovery-code';
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

function activeRideRounds(state) {
  return Object.values(state?.domains?.RIDE?.records || {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'ROUND' && record.status === 'ACTIVE');
}

function activeTransactions(state) {
  return Object.values(state?.domains?.LEDGER?.records || {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION');
}

test('Ride income with no active round asks to open, confirms round mutation, and keeps income pending', async (t) => {
  const session = await fixture(t);

  await chat(session, 'UI-RIDE-OPEN-1', 'วันนี้ได้ 500');
  const ride = await chat(session, 'UI-RIDE-OPEN-2', 'วิ่ง');
  assert.equal(ride.status, 'SUCCESS');
  assert.equal(ride.result.readback.interactionStatus, 'CLARIFICATION_REQUIRED');
  assert.match(ride.result.readback.message, /เปิดรอบ/);

  const beforePrepare = await session.runtime.readState();
  assert.equal(activeRideRounds(beforePrepare).length, 0);
  assert.equal(activeTransactions(beforePrepare).length, 0);

  const prepareOpen = await chat(session, 'UI-RIDE-OPEN-3', 'เปิดรอบ');
  assert.equal(prepareOpen.status, 'SUCCESS');
  assert.equal(prepareOpen.result.readback.interactionStatus, 'CONFIRMATION_REQUIRED');

  const beforeConfirm = await session.runtime.readState();
  assert.equal(activeRideRounds(beforeConfirm).length, 0);
  assert.equal(activeTransactions(beforeConfirm).length, 0);

  const confirmedOpen = await chat(session, 'UI-RIDE-OPEN-4', 'ยืนยัน');
  assert.equal(confirmedOpen.status, 'SUCCESS');

  const afterOpen = await session.runtime.readState();
  assert.equal(activeRideRounds(afterOpen).length, 1);
  assert.equal(activeTransactions(afterOpen).length, 0);

  const resumeIncome = await chat(session, 'UI-RIDE-OPEN-5', 'วิ่ง');
  assert.equal(resumeIncome.status, 'SUCCESS');
  assert.equal(resumeIncome.result.readback.interactionStatus, 'CONFIRMATION_REQUIRED');
  assert.equal(resumeIncome.result.readback.preview.amountSatang, 50000);

  const beforeJobConfirm = await session.runtime.readState();
  assert.equal(activeTransactions(beforeJobConfirm).length, 0);
});
