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

const RECOVERY_CODE = 'LH-integration-recovery-code';
const DEVICE_PIN = '654321';

async function loadAdapter() {
  try {
    return await import('../www/trusted/brain-adapter.mjs');
  } catch (error) {
    assert.fail(`trusted brain adapter is required: ${error?.code ?? error?.message ?? error}`);
  }
}

function requestIds(prefix) {
  let next = 0;
  return () => `REQ-${prefix}-${++next}`;
}

function inputIds(prefix) {
  let next = 0;
  return () => `INPUT-${prefix}-${++next}`;
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

async function createUnlockedRuntime() {
  await resetVault();
  const firstRun = await initializeFirstRun({
    recoveryCode:RECOVERY_CODE,
    password:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    now:() => '2026-08-31T00:00:00.000Z',
  });
  assert.equal(firstRun.status, 'CREATED_VERIFIED');

  const runtime = await openGreenfieldRuntimeWithDevicePin({
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-08-31T00:00:01.000Z',
  });
  activateRuntimeSession(runtime);
  return runtime;
}

async function createBrain(prefix) {
  const { createTrustedBrainAdapter } = await loadAdapter();
  const pathKernel = createPathKernel({ capabilities:[createExpenseCapability()] });
  return createTrustedBrainAdapter({
    routeMasterInputText,
    createRecoverySession,
    applySessionOwnerInput,
    rejoinRecoverySession,
    pathKernel,
    withRuntimeSession,
    requestIdFactory:requestIds(prefix),
    inputIdFactory:inputIds(prefix),
    receivedAt:() => '2026-08-31T00:00:02.000Z',
    timeZone:'Asia/Bangkok',
  });
}

test('ข้าว 65 stays READY without a write until explicit execute, then durable readback survives reopen', async (t) => {
  const runtime = await createUnlockedRuntime();
  t.after(async () => {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
  });
  const brain = await createBrain('READY');

  const before = await runtime.readState();
  const ready = await brain.send('ข้าว 65');
  assert.equal(ready.status, 'READY');
  assert.equal(ready.preview.title, 'ข้าว');
  assert.equal(ready.preview.amountSatang, 6500);
  assert.equal(ready.requiresConfirmation, true);

  const beforeExecute = await runtime.readState();
  assert.equal(beforeExecute.revision, before.revision);
  assert.equal(expenseRecords(beforeExecute).length, 0);

  const success = await brain.execute();
  assert.equal(success.status, 'SUCCESS');
  assert.equal(success.readback.title, 'ข้าว');
  assert.equal(success.readback.amountSatang, 6500);
  assert.equal(expenseRecords(await runtime.readState()).length, 1);

  deactivateRuntimeSession(runtime);
  runtime.close();
  const reopened = await openGreenfieldRuntimeWithDevicePin({
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-08-31T00:01:00.000Z',
  });
  activateRuntimeSession(reopened);
  const reopenedState = await reopened.readState();
  const records = expenseRecords(reopenedState);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'ข้าว');
  assert.equal(records[0].amountSatang, 6500);
  deactivateRuntimeSession(reopened);
  reopened.close();
});

test('ข้าว 1,50 waits for owner correction, returns READY without writing, then executes the corrected amount', async (t) => {
  const runtime = await createUnlockedRuntime();
  t.after(async () => {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
  });
  const brain = await createBrain('WAIT');

  const before = await runtime.readState();
  const waiting = await brain.send('ข้าว 1,50');
  assert.equal(waiting.status, 'WAITING');
  assert.ok(waiting.directive);
  assert.equal(expenseRecords(await runtime.readState()).length, 0);

  const ready = await brain.send('150');
  assert.equal(ready.status, 'READY');
  assert.equal(ready.preview.title, 'ข้าว');
  assert.equal(ready.preview.amountSatang, 15000);
  assert.equal(ready.requiresConfirmation, true);

  const beforeExecute = await runtime.readState();
  assert.equal(beforeExecute.revision, before.revision);
  assert.equal(expenseRecords(beforeExecute).length, 0);

  const success = await brain.execute();
  assert.equal(success.status, 'SUCCESS');
  assert.equal(success.readback.title, 'ข้าว');
  assert.equal(success.readback.amountSatang, 15000);

  const records = expenseRecords(await runtime.readState());
  assert.equal(records.length, 1);
  assert.equal(records[0].amountSatang, 15000);
});

test('concurrent execute writes once and replay after SUCCESS is blocked', async (t) => {
  const runtime = await createUnlockedRuntime();
  t.after(async () => {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
  });
  const brain = await createBrain('CONCURRENT');

  const ready = await brain.send('ข้าว 65');
  assert.equal(ready.status, 'READY');
  assert.equal(expenseRecords(await runtime.readState()).length, 0);

  const [first, second] = await Promise.all([
    brain.execute(),
    brain.execute(),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, ['BLOCKED', 'SUCCESS']);
  const blocked = first.status === 'BLOCKED' ? first : second;
  assert.equal(blocked.reason, 'TRUSTED_BRAIN_EXECUTION_IN_FLIGHT');

  const records = expenseRecords(await runtime.readState());
  assert.equal(records.length, 1);
  assert.equal(records[0].amountSatang, 6500);

  const replay = await brain.execute();
  assert.equal(replay.status, 'BLOCKED');
  assert.equal(replay.reason, 'TRUSTED_BRAIN_NOT_READY');
  assert.equal(expenseRecords(await runtime.readState()).length, 1);
});
