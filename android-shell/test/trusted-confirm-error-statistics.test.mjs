import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';

import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';
import {
  initializeTrustedFirstRun,
  openTrustedBrain,
} from '../www/trusted/bootstrap.mjs';
import { openGreenfieldVaultStore } from '../../greenfield/browser-store.mjs';

const ERROR_STATISTICS_KEY = 'trusted-error-statistics:v1';

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function loadFrontDoor004() {
  try {
    return await import('../release/front-door-0.0.4/logic.mjs');
  } catch (error) {
    assert.fail(`Front Door 0.0.4 logic is required: ${error?.code ?? error?.message ?? error}`);
  }
}

function frontDoorDom() {
  return new JSDOM(`<!doctype html><html><body><main id="app">
    <div data-chat-log></div>
    <div data-empty-state></div>
    <form data-chat-form><input data-chat-input><button type="submit">ส่ง</button></form>
    <section data-settings-panel hidden></section>
  </main></body></html>`, { url:'https://lighthouse.test/' });
}

test('Front Door 0.0.4 asks for trusted execution immediately and never renders a second confirmation button', async () => {
  const { mount } = await loadFrontDoor004();
  const dom = frontDoorDom();
  const root = dom.window.document.getElementById('app');
  let requestExecutionCalls = 0;
  let resolveExecution;
  const execution = new Promise(resolve => { resolveExecution = resolve; });
  const brain = {
    async send() {
      return { status:'READY', preview:{ title:'ข้าว', amountSatang:6500 } };
    },
    async requestExecution() {
      requestExecutionCalls += 1;
      return execution;
    },
  };

  const cleanup = await mount({ root, version:'0.0.4', brain });
  const form = root.querySelector('[data-chat-form]');
  const input = root.querySelector('[data-chat-input]');
  input.value = 'ข้าว 65';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
  await tick();

  assert.equal(requestExecutionCalls, 1, 'READY must enter the one trusted confirmation flow automatically');
  assert.equal(root.querySelector('[data-brain-confirm]'), null, 'Patch UI must not add an extra confirmation button');

  resolveExecution({
    status:'SUCCESS',
    confirmationText:'ยืนยัน',
    readback:{ title:'ข้าว', amountSatang:6500 },
  });
  await tick();
  assert.match(root.querySelector('[data-chat-log]').textContent, /บันทึกและอ่านกลับแล้ว/);

  await cleanup();
  dom.window.close();
});

test('trusted gate accepts the typed trusted answer ยืนยัน as the only approval', async () => {
  let executeCalls = 0;
  let typedPromptCalls = 0;
  const gate = createTrustedBrainGate({
    brain:{
      async send() { return { status:'READY', preview:{ title:'ข้าว', amountSatang:6500 } }; },
      async execute() {
        executeCalls += 1;
        return { status:'SUCCESS', readback:{ title:'ข้าว', amountSatang:6500 } };
      },
    },
    confirmImpl:() => false,
    confirmTextImpl:async () => {
      typedPromptCalls += 1;
      return 'ยืนยัน';
    },
  });

  assert.equal((await gate.send('ข้าว 65')).status, 'READY');
  const result = await gate.requestExecution();
  assert.equal(typedPromptCalls, 1);
  assert.equal(executeCalls, 1);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.confirmationText, 'ยืนยัน');
});

test('trusted gate maps unsupported commands to public 404 and records the private cause with Bangkok time', async () => {
  const recorded = [];
  const gate = createTrustedBrainGate({
    brain:{
      async send() {
        return { status:'UNSUPPORTED', reason:'INTERPRETED_CAPABILITY_NOT_CONNECTED' };
      },
      async execute() { throw new Error('must not execute'); },
    },
    confirmImpl:() => true,
    now:() => '2026-08-31T15:26:30.000Z',
    recordErrorEvent:async event => recorded.push(event),
  });

  const result = await gate.send('วิ่ง 65', { appVersion:'0.0.4' });
  assert.deepEqual(result, {
    status:'ERROR',
    publicCode:404,
    message:'Sorry — error code 404',
  });
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], {
    occurredAt:'2026-08-31T15:26:30.000Z',
    localDate:'2026-08-31',
    localTime:'22:26:30',
    command:'วิ่ง 65',
    publicCode:404,
    internalReason:'INTERPRETED_CAPABILITY_NOT_CONNECTED',
    stage:'ROUTE',
    appVersion:'0.0.4',
  });
});

test('actual trusted session keeps error statistics encrypted in the Greenfield vault without changing business revision', async () => {
  const indexedDBImpl = new IDBFactory();
  const pin = '778899';
  const recoveryCode = 'trusted-error-journal-recovery-code';
  const now = () => '2026-08-31T15:26:30.000Z';

  await initializeTrustedFirstRun({
    recoveryCode,
    pin,
    indexedDBImpl,
    now,
  });
  const session = await openTrustedBrain({
    pin,
    indexedDBImpl,
    lockManager:null,
    now,
    confirmImpl:() => true,
  });

  const before = await session.runtime.readState();
  const result = await session.brain.send('วิ่ง 65', { appVersion:'0.0.4' });
  assert.deepEqual(result, {
    status:'ERROR',
    publicCode:404,
    message:'Sorry — error code 404',
  });

  const rawStore = await openGreenfieldVaultStore({ indexedDBImpl });
  const rawJournal = await rawStore.get(ERROR_STATISTICS_KEY);
  rawStore.close();
  assert.ok(rawJournal && typeof rawJournal === 'object', 'encrypted error journal must exist in the Greenfield vault store');
  assert.equal(typeof rawJournal.ciphertext, 'string');
  const rawText = JSON.stringify(rawJournal);
  assert.doesNotMatch(rawText, /วิ่ง 65/);
  assert.doesNotMatch(rawText, /REMOTE_INTERPRETER_NOT_CONFIGURED/);

  assert.equal(typeof session.readErrorStatistics, 'function');
  const statistics = await session.readErrorStatistics();
  assert.equal(statistics.total, 1);
  assert.equal(statistics.byCode['404'], 1);
  assert.equal(statistics.events.length, 1);
  assert.deepEqual(statistics.events[0], {
    occurredAt:'2026-08-31T15:26:30.000Z',
    localDate:'2026-08-31',
    localTime:'22:26:30',
    command:'วิ่ง 65',
    publicCode:404,
    internalReason:'REMOTE_INTERPRETER_NOT_CONFIGURED',
    stage:'ROUTE',
    appVersion:'0.0.4',
  });

  const after = await session.runtime.readState();
  assert.equal(after.revision, before.revision, 'error journal must not mutate business revision');
  session.close();
});
