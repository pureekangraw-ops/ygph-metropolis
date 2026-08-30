import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mount } from '../release/front-door-0.0.3/logic.mjs';
import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';
import { createGreenfieldState } from '../../greenfield/core.mjs';
import {
  commitEncryptedState,
  createMemoryVaultStore,
} from '../../greenfield/persistence.mjs';
import { createGreenfieldRuntime } from '../../greenfield/runtime.mjs';

const PASSPHRASE = 'trusted-error-statistics-passphrase';

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function frontDoorDom() {
  return new JSDOM(`<!doctype html><html><body><main id="app">
    <div data-chat-log></div>
    <div data-empty-state></div>
    <form data-chat-form><input data-chat-input><button type="submit">ส่ง</button></form>
    <section data-settings-panel hidden></section>
  </main></body></html>`, { url:'https://lighthouse.test/' });
}

test('Front Door asks for trusted execution immediately and never renders a second confirmation button', async () => {
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

  const cleanup = await mount({ root, version:'0.0.3', brain });
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

  const result = await gate.send('วิ่ง 65', { appVersion:'0.0.3' });
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
    appVersion:'0.0.3',
  });
});

test('Greenfield stores error statistics inside the encrypted durable state', async () => {
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-31T15:20:00.000Z' });
  await commitEncryptedState({
    store,
    passphrase:PASSPHRASE,
    state,
    expectedDurableRevision:null,
  });
  const runtime = createGreenfieldRuntime({
    store,
    passphrase:PASSPHRASE,
    lockManager:null,
    now:() => '2026-08-31T15:26:31.000Z',
  });

  assert.equal(typeof runtime.recordErrorEvent, 'function');
  await runtime.recordErrorEvent({
    occurredAt:'2026-08-31T15:26:30.000Z',
    localDate:'2026-08-31',
    localTime:'22:26:30',
    command:'วิ่ง 65',
    publicCode:404,
    internalReason:'INTERPRETED_CAPABILITY_NOT_CONNECTED',
    stage:'ROUTE',
    appVersion:'0.0.3',
  });

  const readback = await runtime.readState();
  assert.equal(readback.meta.errorStatistics.total, 1);
  assert.equal(readback.meta.errorStatistics.byCode['404'], 1);
  assert.equal(readback.meta.errorStatistics.events.length, 1);
  assert.deepEqual(readback.meta.errorStatistics.events[0], {
    occurredAt:'2026-08-31T15:26:30.000Z',
    localDate:'2026-08-31',
    localTime:'22:26:30',
    command:'วิ่ง 65',
    publicCode:404,
    internalReason:'INTERPRETED_CAPABILITY_NOT_CONNECTED',
    stage:'ROUTE',
    appVersion:'0.0.3',
  });
  runtime.close();
});
