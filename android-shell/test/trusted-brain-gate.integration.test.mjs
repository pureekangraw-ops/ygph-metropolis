import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';

import { mountSnapshot } from '../www/patch/patch-runtime.mjs';
import { routeMasterInputText } from '../../lighthouse/master-input-route.mjs';
import { createRecoverySession, applySessionOwnerInput, rejoinRecoverySession } from '../../lighthouse/master-input-recovery-session.mjs';
import { createPathKernel } from '../../lighthouse/path-kernel.mjs';
import { createExpenseCapability } from '../../lighthouse/capabilities/expense.mjs';
import { initializeFirstRun } from '../../greenfield/first-run.mjs';
import { openGreenfieldRuntimeWithDevicePin } from '../../greenfield/runtime.mjs';
import { activateRuntimeSession, deactivateRuntimeSession, withRuntimeSession } from '../../greenfield/runtime-session.mjs';
import { DB_NAME } from '../../greenfield/browser-store.mjs';
import { createTrustedBrainAdapter } from '../www/trusted/brain-adapter.mjs';
import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';

const RECOVERY_CODE = 'LH-trusted-gate-recovery-code';
const DEVICE_PIN = '112233';
function ids(prefix) { let next = 0; return () => `${prefix}-${++next}`; }
function expenseRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records ?? {}).map(entry => entry?.record)
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
  await initializeFirstRun({ recoveryCode:RECOVERY_CODE, password:DEVICE_PIN, indexedDBImpl:fakeIndexedDB, now:() => '2026-08-31T00:20:00.000Z' });
  const runtime = await openGreenfieldRuntimeWithDevicePin({ pin:DEVICE_PIN, indexedDBImpl:fakeIndexedDB, lockManager:null, now:() => '2026-08-31T00:20:01.000Z' });
  activateRuntimeSession(runtime);
  const brain = createTrustedBrainAdapter({
    routeMasterInputText, createRecoverySession, applySessionOwnerInput, rejoinRecoverySession,
    pathKernel:createPathKernel({ capabilities:[createExpenseCapability()] }), withRuntimeSession,
    requestIdFactory:ids('REQ-GATE'), inputIdFactory:ids('INPUT-GATE'), receivedAt:() => '2026-08-31T00:20:02.000Z', timeZone:'Asia/Bangkok',
  });
  return { runtime, brain };
}

test('chat-native cancel is the only denial path and never exposes execute', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => { deactivateRuntimeSession(runtime); runtime.close(); await resetVault(); });
  const capability = createTrustedBrainGate({ brain });
  assert.equal(typeof capability.send, 'function');
  assert.equal(capability.requestExecution, undefined);
  assert.equal(capability.execute, undefined);
  const before = await runtime.readState();
  const pending = await capability.send('ข้าว 65');
  assert.equal(pending.status, 'CONFIRMATION_REQUIRED');
  assert.match(pending.question, /ข้าว 65 บาท/);
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
  const denied = await capability.send('ยกเลิก');
  assert.equal(denied.status, 'CANCELLED');
  const after = await runtime.readState();
  assert.equal(after.revision, before.revision);
  assert.equal(expenseRecords(after).length, 0);
});

test('chat-native approval is the only path from pending to durable SUCCESS and replay fails closed', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => { deactivateRuntimeSession(runtime); runtime.close(); await resetVault(); });
  const capability = createTrustedBrainGate({ brain });
  assert.equal((await capability.send('ข้าว 65')).status, 'CONFIRMATION_REQUIRED');
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
  const success = await capability.send('ยืนยัน');
  assert.equal(success.status, 'SUCCESS');
  assert.equal(success.readback.amountSatang, 6500);
  assert.equal(expenseRecords(await runtime.readState()).length, 1);
  const replay = await capability.send('ยืนยัน');
  assert.notEqual(replay.status, 'SUCCESS');
  assert.equal(expenseRecords(await runtime.readState()).length, 1);
});

test('unrelated text while pending fails closed and preserves the original pending command', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => { deactivateRuntimeSession(runtime); runtime.close(); await resetVault(); });
  const capability = createTrustedBrainGate({ brain });
  await capability.send('ข้าว 65');
  const blocked = await capability.send('สวัสดี');
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.reason, 'TRUSTED_CONFIRMATION_TEXT_INVALID');
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
  const success = await capability.send('ยืนยัน');
  assert.equal(success.status, 'SUCCESS');
  assert.equal(success.readback.title, 'ข้าว');
  assert.equal(expenseRecords(await runtime.readState()).length, 1);
});

test('malicious Patch cannot obtain raw execute or a second confirmation seam', async (t) => {
  const { runtime, brain } = await setupBrain();
  t.after(async () => { deactivateRuntimeSession(runtime); runtime.close(); await resetVault(); });
  const capability = createTrustedBrainGate({ brain });
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url:'https://lighthouse.test/' });
  t.after(() => dom.window.close());
  const root = dom.window.document.getElementById('app');
  const snapshot = {
    version:'0.0.5-malicious-test',
    assets:{
      'ui.html':'<main data-malicious-result></main>', 'ui.css':'', 'rules.json':'{}', 'vocabulary.json':'{}',
      'logic.mjs':`export async function mount({ root, brain }) {
        root.dataset.rawExecute = typeof brain?.execute;
        root.dataset.requestExecution = typeof brain?.requestExecution;
        const pending = await brain.send('ข้าว 65');
        root.dataset.pending = pending?.status || '';
        const attempted = await brain.send('force execute');
        root.dataset.attempted = attempted?.status || '';
      }`,
    },
  };
  const before = await runtime.readState();
  const cleanup = await mountSnapshot(snapshot, { root, documentRef:dom.window.document, trustedBrain:capability,
    createModuleUrl:(source) => `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`,
    importModule:(url) => import(url), revokeModuleUrl:() => {} });
  t.after(cleanup);
  assert.equal(root.dataset.rawExecute, 'undefined');
  assert.equal(root.dataset.requestExecution, 'undefined');
  assert.equal(root.dataset.pending, 'CONFIRMATION_REQUIRED');
  assert.equal(root.dataset.attempted, 'BLOCKED');
  const after = await runtime.readState();
  assert.equal(after.revision, before.revision);
  assert.equal(expenseRecords(after).length, 0);
});
