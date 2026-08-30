import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';

import { mountSnapshot } from '../www/patch/patch-runtime.mjs';
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
import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';

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

test('patch capability never exposes execute and cannot write when trusted confirmation is denied', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
  });
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

test('malicious Patch cannot bypass trusted confirmation or obtain raw execute authority', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
  });
  let confirmations = 0;
  const capability = createTrustedBrainGate({
    brain,
    confirmImpl:() => {
      confirmations += 1;
      return false;
    },
  });
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
    url:'https://lighthouse.test/',
  });
  t.after(() => dom.window.close());
  const root = dom.window.document.getElementById('app');
  const snapshot = {
    version:'0.0.3-malicious-test',
    assets:{
      'ui.html':'<main data-malicious-result></main>',
      'ui.css':'',
      'rules.json':'{}',
      'vocabulary.json':'{}',
      'logic.mjs':`export async function mount({ root, brain }) {
        root.dataset.rawExecute = typeof brain?.execute;
        const ready = await brain.send('ข้าว 65');
        root.dataset.ready = ready?.status || '';
        root.dataset.direct = typeof brain?.execute === 'function' ? (await brain.execute())?.status : 'UNAVAILABLE';
        root.dataset.requested = (await brain.requestExecution())?.status || '';
      }`,
    },
  };

  const before = await runtime.readState();
  const cleanup = await mountSnapshot(snapshot, {
    root,
    documentRef:dom.window.document,
    trustedBrain:capability,
    createModuleUrl:(source) => `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`,
    importModule:(url) => import(url),
    revokeModuleUrl:() => {},
  });
  t.after(cleanup);

  assert.equal(root.dataset.rawExecute, 'undefined');
  assert.equal(root.dataset.ready, 'READY');
  assert.equal(root.dataset.direct, 'UNAVAILABLE');
  assert.equal(root.dataset.requested, 'CANCELLED');
  assert.equal(confirmations, 1);
  const after = await runtime.readState();
  assert.equal(after.revision, before.revision);
  assert.equal(expenseRecords(after).length, 0);
});

test('trusted gate captures confirmation before Patch can replace the global function', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
  });

  const original = globalThis.confirm;
  let trustedCalls = 0;
  let maliciousCalls = 0;
  globalThis.confirm = () => {
    trustedCalls += 1;
    return false;
  };
  t.after(() => { globalThis.confirm = original; });

  const capability = createTrustedBrainGate({ brain });
  globalThis.confirm = () => {
    maliciousCalls += 1;
    return true;
  };

  assert.equal((await capability.send('ข้าว 65')).status, 'READY');
  const denied = await capability.requestExecution();
  assert.equal(denied.status, 'CANCELLED');
  assert.equal(trustedCalls, 1);
  assert.equal(maliciousCalls, 0);
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
});
