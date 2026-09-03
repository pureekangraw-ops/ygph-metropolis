import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';
import { initializeTrustedFirstRun, openTrustedBrain } from '../www/trusted/bootstrap.mjs';
import { openGreenfieldVaultStore } from '../../greenfield/browser-store.mjs';

const ERROR_STATISTICS_KEY = 'trusted-error-statistics:v1';
function tick() { return new Promise(resolve => setTimeout(resolve, 0)); }
async function loadFrontDoor005() {
  try { return await import('../release/front-door-0.0.5/logic.mjs'); }
  catch (error) { assert.fail(`Front Door 0.0.5 logic is required: ${error?.code ?? error?.message ?? error}`); }
}
function frontDoorDom() {
  return new JSDOM('<!doctype html><html><body><main id="app"><div data-chat-log></div><div data-empty-state></div><form data-chat-form><input data-chat-input><button type="submit">ส่ง</button></form><section data-settings-panel hidden></section></main></body></html>', { url:'https://lighthouse.test/' });
}

test('Front Door 0.0.5 renders trusted confirmation as chat text and uses the same composer for approval', async () => {
  const { mount } = await loadFrontDoor005();
  const dom = frontDoorDom(); const root = dom.window.document.getElementById('app');
  let executeCalls = 0; let pending = false;
  const brain = {
    async send(text) {
      if (!pending) { pending = true; return { status:'CONFIRMATION_REQUIRED', question:'จะบันทึก ข้าว 65 บาทไหม' }; }
      if (text === 'ยืนยัน') { pending = false; executeCalls += 1; return { status:'SUCCESS', readback:{ title:'ข้าว', amountSatang:6500 } }; }
      return { status:'BLOCKED', question:'จะบันทึก ข้าว 65 บาทไหม' };
    },
  };
  const cleanup = await mount({ root, version:'0.0.5', brain });
  const form = root.querySelector('[data-chat-form]'); const input = root.querySelector('[data-chat-input]');
  input.value = 'ข้าว 65'; form.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true })); await tick();
  assert.match(root.querySelector('[data-chat-log]').textContent, /จะบันทึก ข้าว 65 บาทไหม/);
  assert.equal(executeCalls, 0);
  assert.equal(root.querySelector('[data-lighthouse-trusted-confirmation-host]'), null);
  input.value = 'ยืนยัน'; form.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true })); await tick();
  assert.equal(executeCalls, 1);
  assert.match(root.querySelector('[data-chat-log]').textContent, /บันทึกและอ่านผลกลับแล้ว/);
  await cleanup(); dom.window.close();
});

test('trusted gate accepts only chat answer ยืนยัน as approval', async () => {
  let executeCalls = 0;
  const gate = createTrustedBrainGate({ brain:{
    async send() { return { status:'READY', preview:{ title:'ข้าว', amountSatang:6500 } }; },
    async execute() { executeCalls += 1; return { status:'SUCCESS', readback:{ title:'ข้าว', amountSatang:6500 } }; },
  } });
  const pending = await gate.send('ข้าว 65');
  assert.equal(pending.status, 'CONFIRMATION_REQUIRED');
  assert.equal(executeCalls, 0);
  const result = await gate.send('ยืนยัน');
  assert.equal(executeCalls, 1); assert.equal(result.status, 'SUCCESS'); assert.equal(result.readback.amountSatang, 6500);
});

test('trusted gate maps unsupported commands to public 404 and records the private cause with Bangkok time', async () => {
  const recorded = [];
  const gate = createTrustedBrainGate({ brain:{
    async send() { return { status:'UNSUPPORTED', reason:'INTERPRETED_CAPABILITY_NOT_CONNECTED' }; },
    async execute() { throw new Error('must not execute'); },
  }, now:() => '2026-08-31T15:26:30.000Z', recordErrorEvent:async event => recorded.push(event) });
  const result = await gate.send('วิ่ง 65', { appVersion:'0.0.5' });
  assert.deepEqual(result, { status:'ERROR', publicCode:404, message:'Sorry — error code 404' });
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], { occurredAt:'2026-08-31T15:26:30.000Z', localDate:'2026-08-31', localTime:'22:26:30', command:'วิ่ง 65', publicCode:404, internalReason:'INTERPRETED_CAPABILITY_NOT_CONNECTED', stage:'ROUTE', appVersion:'0.0.5' });
});

test('actual trusted session keeps error statistics encrypted without changing business revision', async () => {
  const indexedDBImpl = new IDBFactory(); const pin = '778899'; const recoveryCode = 'trusted-error-journal-recovery-code'; const now = () => '2026-08-31T15:26:30.000Z';
  await initializeTrustedFirstRun({ recoveryCode, pin, indexedDBImpl, now });
  const session = await openTrustedBrain({ pin, indexedDBImpl, lockManager:null, now });
  const before = await session.runtime.readState();
  const result = await session.brain.send('วิ่ง 65', { appVersion:'0.0.5' });
  assert.deepEqual(result, { status:'ERROR', publicCode:404, message:'Sorry — error code 404' });
  const rawStore = await openGreenfieldVaultStore({ indexedDBImpl }); const rawJournal = await rawStore.get(ERROR_STATISTICS_KEY); rawStore.close();
  assert.ok(rawJournal && typeof rawJournal === 'object'); assert.equal(typeof rawJournal.ciphertext, 'string');
  const rawText = JSON.stringify(rawJournal); assert.doesNotMatch(rawText, /วิ่ง 65/); assert.doesNotMatch(rawText, /REMOTE_INTERPRETER_NOT_CONFIGURED/);
  const statistics = await session.readErrorStatistics(); assert.equal(statistics.total, 1); assert.equal(statistics.byCode['404'], 1); assert.equal(statistics.events.length, 1);
  assert.deepEqual(statistics.events[0], { occurredAt:'2026-08-31T15:26:30.000Z', localDate:'2026-08-31', localTime:'22:26:30', command:'วิ่ง 65', publicCode:404, internalReason:'REMOTE_INTERPRETER_NOT_CONFIGURED', stage:'ROUTE', appVersion:'0.0.5' });
  const after = await session.runtime.readState(); assert.equal(after.revision, before.revision); session.close();
});
