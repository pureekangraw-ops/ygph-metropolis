import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';

import { mountSnapshot } from '../www/patch/patch-runtime.mjs';
import { createTrustedBrainAdapter } from '../www/trusted/brain-adapter.mjs';
import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';
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

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');
const RECOVERY_CODE = 'LH-frontdoor-integration-code';
const DEVICE_PIN = '778899';

function ids(prefix) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function expenseRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records ?? {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION' && record?.direction === 'OUT' && String(record?.detail ?? '').includes('EXPENSE'));
}

function deferredConfirmation() {
  let resolve;
  let calls = 0;
  const promise = new Promise(done => { resolve = done; });
  return {
    ask:async () => {
      calls += 1;
      return promise;
    },
    resolve,
    get calls() { return calls; },
  };
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

async function createRuntimeAndBrain(confirmTextImpl = async () => 'ยืนยัน') {
  await resetVault();
  await initializeFirstRun({
    recoveryCode:RECOVERY_CODE,
    password:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    now:() => '2026-08-31T00:10:00.000Z',
  });
  const runtime = await openGreenfieldRuntimeWithDevicePin({
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-08-31T00:10:01.000Z',
  });
  activateRuntimeSession(runtime);
  const pathKernel = createPathKernel({ capabilities:[createExpenseCapability()] });
  const adapter = createTrustedBrainAdapter({
    routeMasterInputText,
    createRecoverySession,
    applySessionOwnerInput,
    rejoinRecoverySession,
    pathKernel,
    withRuntimeSession,
    requestIdFactory:ids('REQ-DOM'),
    inputIdFactory:ids('INPUT-DOM'),
    receivedAt:() => '2026-08-31T00:10:02.000Z',
    timeZone:'Asia/Bangkok',
  });
  const brain = createTrustedBrainGate({
    brain:adapter,
    confirmImpl:() => true,
    confirmTextImpl,
  });
  return { runtime, brain };
}

async function patchSnapshot() {
  const input = JSON.parse(await read('test/fixtures/front-door-0.0.3-input.json'));
  return {
    version:'0.0.4',
    assets:{
      'ui.html':input.files['ui.html'],
      'ui.css':input.files['ui.css'],
      'logic.mjs':await read('release/front-door-0.0.4/logic.mjs'),
      'rules.json':await read('www/app/rules.json'),
      'vocabulary.json':await read('www/app/vocabulary.json'),
    },
  };
}

async function waitFor(predicate, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

async function mountIntegratedFrontDoor(brain) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div id="app"></div>
    <aside class="patch-controls">
      <input id="patch-file" type="file">
      <button id="patch-rollback" type="button">Rollback</button>
      <p id="patch-status"></p>
    </aside>
  </body></html>`, { url:'https://lighthouse.test/' });
  const app = dom.window.document.getElementById('app');
  const cleanup = await mountSnapshot(await patchSnapshot(), {
    root:app,
    documentRef:dom.window.document,
    trustedBrain:brain,
    createModuleUrl:(source) => `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`,
    importModule:(url) => import(url),
    revokeModuleUrl:() => {},
  });
  return { dom, app, cleanup };
}

async function submit(dom, app, value) {
  const composer = app.querySelector('[data-chat-form]');
  const input = app.querySelector('[data-chat-input]');
  input.value = value;
  composer.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
}

test('actual patched Front Door 0.0.4 writes only after one trusted typed confirmation', async (t) => {
  const confirmation = deferredConfirmation();
  const { runtime, brain } = await createRuntimeAndBrain(confirmation.ask);
  const { dom, app, cleanup } = await mountIntegratedFrontDoor(brain);

  t.after(async () => {
    await cleanup();
    deactivateRuntimeSession(runtime);
    runtime.close();
    dom.window.close();
    await resetVault();
  });

  const initial = await runtime.readState();
  await submit(dom, app, 'ข้าว 65');
  await waitFor(() => confirmation.calls === 1, 'single trusted typed confirmation');

  const beforeConfirm = await runtime.readState();
  assert.equal(beforeConfirm.revision, initial.revision);
  assert.equal(expenseRecords(beforeConfirm).length, 0);
  assert.equal(app.querySelector('[data-brain-confirm]'), null, 'Front Door must not render a second confirmation button');
  assert.equal(brain.execute, undefined, 'mounted patch capability must not expose execute');

  confirmation.resolve('ยืนยัน');
  await waitFor(
    () => app.querySelector('[data-chat-log]').textContent.includes('บันทึกและอ่านกลับแล้ว'),
    'durable SUCCESS readback in conversation',
  );

  const afterConfirm = await runtime.readState();
  const records = expenseRecords(afterConfirm);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'ข้าว');
  assert.equal(records[0].amountSatang, 6500);
  assert.match(app.querySelector('[data-chat-log]').textContent, /65\.00|65,00|65 บาท/);
});

test('actual patched Front Door 0.0.4 shows WAITING, accepts correction, then uses one trusted typed confirmation', async (t) => {
  const confirmation = deferredConfirmation();
  const { runtime, brain } = await createRuntimeAndBrain(confirmation.ask);
  const { dom, app, cleanup } = await mountIntegratedFrontDoor(brain);

  t.after(async () => {
    await cleanup();
    deactivateRuntimeSession(runtime);
    runtime.close();
    dom.window.close();
    await resetVault();
  });

  const initial = await runtime.readState();
  await submit(dom, app, 'ข้าว 1,50');
  await waitFor(
    () => /กรอก|ข้อมูล|ระบุ|ยืนยัน/.test(app.querySelector('[data-chat-log]').textContent),
    'WAITING recovery prompt',
  );
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
  assert.equal(confirmation.calls, 0);

  await submit(dom, app, '150');
  await waitFor(() => confirmation.calls === 1, 'corrected trusted typed confirmation');
  const readyState = await runtime.readState();
  assert.equal(readyState.revision, initial.revision);
  assert.equal(expenseRecords(readyState).length, 0);
  assert.equal(app.querySelector('[data-brain-confirm]'), null);

  confirmation.resolve('ยืนยัน');
  await waitFor(
    () => app.querySelector('[data-chat-log]').textContent.includes('บันทึกและอ่านกลับแล้ว'),
    'corrected durable SUCCESS readback in conversation',
  );

  const records = expenseRecords(await runtime.readState());
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'ข้าว');
  assert.equal(records[0].amountSatang, 15000);
});
