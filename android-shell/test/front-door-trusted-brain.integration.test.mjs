import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';

import { mountSnapshot } from '../www/patch/patch-runtime.mjs';
import { createTrustedBrainAdapter } from '../www/trusted/brain-adapter.mjs';
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

async function resetVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('TEST_DB_DELETE_FAILED'));
    request.onblocked = () => reject(new Error('TEST_DB_DELETE_BLOCKED'));
  });
}

async function createRuntimeAndBrain() {
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
  const brain = createTrustedBrainAdapter({
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
  return { runtime, brain };
}

async function patchSnapshot() {
  const input = JSON.parse(await read('test/fixtures/front-door-0.0.3-input.json'));
  return {
    version:input.version,
    assets:{
      'ui.html':input.files['ui.html'],
      'ui.css':input.files['ui.css'],
      'logic.mjs':await read('release/front-door-0.0.3/logic.mjs'),
      'rules.json':await read('www/app/rules.json'),
      'vocabulary.json':await read('www/app/vocabulary.json'),
    },
  };
}

async function flushUi() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
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
  await flushUi();
}

test('actual patched Front Door calls trusted brain and writes only after visible explicit confirmation', async (t) => {
  const { runtime, brain } = await createRuntimeAndBrain();
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

  const beforeConfirm = await runtime.readState();
  assert.equal(beforeConfirm.revision, initial.revision);
  assert.equal(expenseRecords(beforeConfirm).length, 0);

  const messages = [...app.querySelectorAll('.message')];
  assert.equal(messages[0].textContent, 'ข้าว 65');
  assert.match(messages.at(-1).textContent, /พร้อม|ยืนยัน/);

  const confirm = app.querySelector('[data-brain-confirm]');
  assert.ok(confirm, 'READY response must expose an explicit confirmation control');
  confirm.click();
  await flushUi();

  const afterConfirm = await runtime.readState();
  const records = expenseRecords(afterConfirm);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'ข้าว');
  assert.equal(records[0].amountSatang, 6500);
  assert.match(app.querySelector('[data-chat-log]').textContent, /65\.00|65,00|65 บาท/);
});

test('actual patched Front Door shows WAITING, accepts correction, then confirms the corrected durable amount', async (t) => {
  const { runtime, brain } = await createRuntimeAndBrain();
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
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
  assert.match(app.querySelector('[data-chat-log]').textContent, /กรอก|ข้อมูล|ระบุ|ยืนยัน/);
  assert.equal(app.querySelector('[data-brain-confirm]'), null);

  await submit(dom, app, '150');
  const readyState = await runtime.readState();
  assert.equal(readyState.revision, initial.revision);
  assert.equal(expenseRecords(readyState).length, 0);

  const confirm = app.querySelector('[data-brain-confirm]');
  assert.ok(confirm, 'corrected READY response must expose confirmation');
  assert.match(app.querySelector('[data-chat-log]').textContent, /150\.00|150,00|150 บาท/);
  confirm.click();
  await flushUi();

  const records = expenseRecords(await runtime.readState());
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'ข้าว');
  assert.equal(records[0].amountSatang, 15000);
});
