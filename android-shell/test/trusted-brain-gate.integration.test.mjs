import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

import { routeMasterInputText } from '../../lighthouse/master-input-route.mjs';
import {
  createRecoverySession,
  applySessionOwnerInput,
  rejoinRecoverySession,
} from '../../lighthouse/master-input-recovery-session.mjs';
import { createPathKernel } from '../../lighthouse/path-kernel.mjs';
import { createExpenseCapability } from '../../lighthouse/capabilities/expense.mjs';
import { initializeFirstRun } from '../../greenfield/first-run.mjs';
import { openGreenfieldRuntimeWithDevicePin } from '../../greenfield/runtime.mjs';
import {
  activateRuntimeSession,
  deactivateRuntimeSession,
  withRuntimeSession,
} from '../../greenfield/runtime-session.mjs';
import { DB_NAME } from '../../greenfield/browser-store.mjs';
import { createTrustedBrainAdapter } from '../www/trusted/brain-adapter.mjs';

const RECOVERY_CODE = 'LH-trusted-gate-recovery-code';
const DEVICE_PIN = '112233';

function ids(prefix) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function expenseRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records ?? {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION' && record?.direction === 'OUT' && String(record?.detail ?? '').includes('EXPENSE'));
}

async function resetVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('TEST_DB_DELETE_FAILED'));
    request.onblocked = () => reject(new Error('TEST_DB_DELETE_BLOCKED'));
  });
}

async function setupBrain() {
  await resetVault();
  await initializeFirstRun({
    recoveryCode:RECOVERY_CODE,
    password:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    now:() => '2026-08-31T00:20:00.000Z',
  });
  const runtime = await openGreenfieldRuntimeWithDevicePin({
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-08-31T00:20:01.000Z',
  });
  activateRuntimeSession(runtime);
  const brain = createTrustedBrainAdapter({
    routeMasterInputText,
    createRecoverySession,
    applySessionOwnerInput,
    rejoinRecoverySession,
    pathKernel:createPathKernel({ capabilities:[createExpenseCapability()] }),
    withRuntimeSession,
    requestIdFactory:ids('REQ-GATE'),
    inputIdFactory:ids('INPUT-GATE'),
    receivedAt:() => '2026-08-31T00:20:02.000Z',
    timeZone:'Asia/Bangkok',
  });
  return { runtime, brain };
}

async function loadGate() {
  try {
    return await import('../www/trusted/brain-gate.mjs');
  } catch (error) {
    assert.fail(`trusted confirmation gate is required: ${error?.code ?? error?.message ?? error}`);
  }
}

test('patch capability never exposes execute and cannot write when trusted confirmation is denied', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
  });
  const { createTrustedBrainGate } = await loadGate();
  let confirmations = 0;
  const capability = createTrustedBrainGate({
    brain,
    confirmImpl:() => {
      confirmations += 1;
      return false;
    },
  });

  assert.equal(typeof capability.send, 'function');
  assert.equal(typeof capability.requestExecution, 'function');
  assert.equal(capability.execute, undefined, 'patch must never receive raw execute authority');

  const before = await runtime.readState();
  const ready = await capability.send('ข้าว 65');
  assert.equal(ready.status, 'READY');
  assert.equal(expenseRecords(await runtime.readState()).length, 0);

  const denied = await capability.requestExecution();
  assert.equal(confirmations, 1);
  assert.equal(denied.status, 'CANCELLED');
  assert.equal(denied.reason, 'TRUSTED_CONFIRMATION_DECLINED');

  const after = await runtime.readState();
  assert.equal(after.revision, before.revision);
  assert.equal(expenseRecords(after).length, 0);
});

test('trusted confirmation approval is the only path from READY to durable SUCCESS', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
  });
  const { createTrustedBrainGate } = await loadGate();
  let confirmations = 0;
  const capability = createTrustedBrainGate({
    brain,
    confirmImpl:(message) => {
      confirmations += 1;
      assert.match(message, /ข้าว/);
      assert.match(message, /65\.00/);
      return true;
    },
  });

  const ready = await capability.send('ข้าว 65');
  assert.equal(ready.status, 'READY');
  assert.equal(expenseRecords(await runtime.readState()).length, 0);

  const success = await capability.requestExecution();
  assert.equal(confirmations, 1);
  assert.equal(success.status, 'SUCCESS');
  assert.equal(success.readback.amountSatang, 6500);
  assert.equal(expenseRecords(await runtime.readState()).length, 1);

  const replay = await capability.requestExecution();
  assert.equal(replay.status, 'BLOCKED');
  assert.equal(replay.reason, 'TRUSTED_CONFIRMATION_NOT_READY');
  assert.equal(confirmations, 1, 'replay must not even open another confirmation prompt');
});
