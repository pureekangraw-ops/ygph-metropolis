import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { mountSnapshot } from '../www/patch/patch-runtime.mjs';
import { createTrustedBrainAdapter } from '../www/trusted/brain-adapter.mjs';
import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';
import { routeMasterInputText } from '../../lighthouse/master-input-route.mjs';
import { createRecoverySession, applySessionOwnerInput, rejoinRecoverySession } from '../../lighthouse/master-input-recovery-session.mjs';
import { createPathKernel } from '../../lighthouse/path-kernel.mjs';
import { createExpenseCapability } from '../../lighthouse/capabilities/expense.mjs';
import { initializeFirstRun } from '../../greenfield/first-run.mjs';
import { openGreenfieldRuntimeWithDevicePin } from '../../greenfield/runtime.mjs';
import { activateRuntimeSession, deactivateRuntimeSession, withRuntimeSession } from '../../greenfield/runtime-session.mjs';
import { DB_NAME } from '../../greenfield/browser-store.mjs';

const root = new URL('../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');
const RECOVERY_CODE = 'LH-frontdoor-integration-code';
const DEVICE_PIN = '778899';
function ids(prefix) { let next = 0; return () => `${prefix}-${++next}`; }
function expenseRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records ?? {}).map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION' && record?.direction === 'OUT' && String(record?.detail ?? '').includes('EXPENSE'));
}
async function resetVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error || new Error('TEST_DB_DELETE_FAILED')); request.onblocked = () => reject(new Error('TEST_DB_DELETE_BLOCKED'));
  });
}
async function createRuntimeAndBrain() {
  await resetVault();
  await initializeFirstRun({ recoveryCode:RECOVERY_CODE, password:DEVICE_PIN, indexedDBImpl:fakeIndexedDB, now:() => '2026-08-31T00:10:00.000Z' });
  const runtime = await openGreenfieldRuntimeWithDevicePin({ pin:DEVICE_PIN, indexedDBImpl:fakeIndexedDB, lockManager:null, now:() => '2026-08-31T00:10:01.000Z' });
  activateRuntimeSession(runtime);
  const adapter = createTrustedBrainAdapter({
    routeMasterInputText, createRecoverySession, applySessionOwnerInput, rejoinRecoverySession,
    pathKernel:createPathKernel({ capabilities:[createExpenseCapability()] }), withRuntimeSession,
    requestIdFactory:ids('REQ-DOM'), inputIdFactory:ids('INPUT-DOM'), receivedAt:() => '2026-08-31T00:10:02.000Z', timeZone:'Asia/Bangkok',
  });
  return { runtime, brain:createTrustedBrainGate({ brain:adapter }) };
}
async function patchSnapshot() {
  const fixture = JSON.parse(await read('test/fixtures/front-door-0.0.3-input.json'));
  return { version:'0.0.5', assets:{
    'ui.html':await read('release/front-door-0.0.5/ui.html'),
    'ui.css':fixture.files['ui.css'],
    'logic.mjs':await read('release/front-door-0.0.5/logic.mjs'),
    'rules.json':await read('www/app/rules.json'),
    'vocabulary.json':await read('www/app/vocabulary.json'),
  } };
}
async function waitFor(predicate, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail(`Timed out waiting for ${label}`);
}
async function mountIntegratedFrontDoor(brain) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div><aside class="patch-controls"><button id="patch-latest">Patch</button><input id="patch-file" type="file"><button id="patch-rollback">Rollback</button><p id="patch-status"></p></aside></body></html>', { url:'https://lighthouse.test/' });
  const app = dom.window.document.getElementById('app');
  let cleanup = async () => {};
  try {
    cleanup = await mountSnapshot(await patchSnapshot(), { root:app, documentRef:dom.window.document, trustedBrain:brain, patchUpdater:{ updateLatest:async () => ({ status:'LATEST' }), openManualPicker(){} },
      createModuleUrl:source => `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`, importModule:url => import(url), revokeModuleUrl:() => {} });
    return { dom, app, cleanup };
  } catch (error) {
    dom.window.close();
    throw error;
  }
}
async function submit(dom, app, value) {
  const composer = app.querySelector('[data-chat-form]'); const input = app.querySelector('[data-chat-input]'); input.value = value;
  composer.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
}

async function setupMounted(t) {
  const { runtime, brain } = await createRuntimeAndBrain();
  let mounted;
  try {
    mounted = await mountIntegratedFrontDoor(brain);
  } catch (error) {
    deactivateRuntimeSession(runtime);
    runtime.close();
    await resetVault();
    throw error;
  }
  const { dom, app, cleanup } = mounted;
  t.after(async () => { await cleanup(); deactivateRuntimeSession(runtime); runtime.close(); dom.window.close(); await resetVault(); });
  return { runtime, brain, dom, app };
}

test('Front Door 0.0.5 asks and confirms entirely through the same chat composer', async (t) => {
  const { runtime, brain, dom, app } = await setupMounted(t);
  const initial = await runtime.readState();
  await submit(dom, app, 'ข้าว 65');
  await waitFor(() => app.querySelector('[data-chat-log]').textContent.includes('จะบันทึก ข้าว 65 บาทไหม'), 'chat confirmation question');
  const beforeConfirm = await runtime.readState();
  assert.equal(beforeConfirm.revision, initial.revision);
  assert.equal(expenseRecords(beforeConfirm).length, 0);
  assert.equal(app.querySelector('[data-lighthouse-trusted-confirmation-host]'), null);
  assert.equal(app.querySelector('[data-brain-confirm]'), null);
  assert.equal(brain.requestExecution, undefined);
  await submit(dom, app, 'ยืนยัน');
  await waitFor(() => app.querySelector('[data-chat-log]').textContent.includes('บันทึกและอ่านผลกลับแล้ว'), 'durable readback in conversation');
  const records = expenseRecords(await runtime.readState());
  assert.equal(records.length, 1); assert.equal(records[0].title, 'ข้าว'); assert.equal(records[0].amountSatang, 6500);
  assert.match(app.querySelector('[data-chat-log]').textContent, /ยืนยัน/);
});

test('Front Door 0.0.5 cancel and unrelated answer fail closed without mutation', async (t) => {
  const { runtime, dom, app } = await setupMounted(t);
  const initial = await runtime.readState();
  await submit(dom, app, 'ข้าว 65');
  await waitFor(() => app.querySelector('[data-chat-log]').textContent.includes('จะบันทึก ข้าว 65 บาทไหม'), 'question');
  await submit(dom, app, 'สวัสดี');
  await waitFor(() => app.querySelector('[data-chat-log]').textContent.includes('กรุณาตอบ'), 'fail closed reminder');
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
  await submit(dom, app, 'ยกเลิก');
  await waitFor(() => app.querySelector('[data-chat-log]').textContent.includes('ยกเลิกการบันทึกแล้ว'), 'cancel response');
  const after = await runtime.readState(); assert.equal(after.revision, initial.revision); assert.equal(expenseRecords(after).length, 0);
});

test('Front Door 0.0.5 WAITING correction returns to chat-native confirmation', async (t) => {
  const { runtime, dom, app } = await setupMounted(t);
  await submit(dom, app, 'ข้าว 1,50');
  await waitFor(() => /กรอก|ข้อมูล|ระบุ|ยืนยัน/.test(app.querySelector('[data-chat-log]').textContent), 'WAITING prompt');
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
  await submit(dom, app, '150');
  await waitFor(() => app.querySelector('[data-chat-log]').textContent.includes('จะบันทึก'), 'corrected confirmation');
  assert.equal(expenseRecords(await runtime.readState()).length, 0);
  await submit(dom, app, 'ยืนยัน');
  await waitFor(() => app.querySelector('[data-chat-log]').textContent.includes('บันทึกและอ่านผลกลับแล้ว'), 'corrected durable readback');
  const records = expenseRecords(await runtime.readState()); assert.equal(records.length, 1); assert.equal(records[0].amountSatang, 15000);
});
