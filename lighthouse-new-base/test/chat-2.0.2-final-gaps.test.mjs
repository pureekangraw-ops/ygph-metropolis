import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createExpenseChatBridge } from '../src/chat-expense-bridge.mjs';
import { createChatStore } from '../src/chat-store.mjs';
import { createChatController } from '../src/chat-controller.mjs';
import { createBrowserApp } from '../src/browser-app.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function expenseRuntime() {
  const records = {};
  return {
    async expense(input) {
      records[input.ledgerTransactionId] = { record:{
        recordId:input.ledgerTransactionId,
        type:'TRANSACTION', direction:'OUT', subtype:'EXPENSE',
        title:input.title, amountSatang:input.amountSatang,
      } };
    },
    async readState() { return { revision:Object.keys(records).length, domains:{ LEDGER:{ records } } }; },
  };
}

test('production expense readback evidence is forwarded into the durable CHAT work record', async () => {
  const runtime = expenseRuntime();
  const bridge = createExpenseChatBridge({ runtime, requestIdFactory:() => 'REQ-final-proof' });
  const store = createChatStore({ storage:memoryStorage() });
  const chat = createChatController({
    store,
    interpret:text => bridge.interpret(text),
    commit:draft => bridge.commit(draft),
    readback:(result, draft) => bridge.readback(result, draft),
  });
  const sent = await chat.send('ข้าว 65');
  await chat.confirm(sent.pending.messageId);
  const document = store.read();
  const work = document.work.find(item => item.messageId === sent.pending.messageId);
  assert.equal(work.status, 'SUCCESS');
  assert.equal(work.readback?.recordId, 'TX-LH-REQ-final-proof');
  assert.equal(work.readback?.amountSatang, 6500);
});

test('Archive removes the completed CHAT item including related replies from active view but preserves history', async () => {
  const store = createChatStore({ storage:memoryStorage() });
  const chat = createChatController({
    store,
    interpret:async text => ({ type:'draft', owner:'outcome', action:'expense', rawText:text, fields:{ title:'ข้าว', amountSatang:6500 }, summary:'รายจ่าย ข้าว 65 บาท', request:{ operationId:'op-archive' } }),
    commit:async () => ({ status:'COMPLETE', readback:{ recordId:'TX-archive' } }),
    readback:async result => ({ ok:true, evidence:result.readback }),
  });
  const sent = await chat.send('ข้าว 65');
  await chat.confirm(sent.pending.messageId);
  assert.ok(chat.snapshot().messages.length >= 2);
  chat.archive(sent.pending.messageId);
  assert.equal(chat.snapshot().messages.some(item => item.id === sent.pending.messageId || item.relatedMessageId === sent.pending.messageId), false);
  const document = store.read();
  assert.equal(document.messages.some(item => item.id === sent.pending.messageId), true);
  assert.equal(document.messages.some(item => item.relatedMessageId === sent.pending.messageId), true);
});

test('SETTINGS removes actions without real production handlers before they can be displayed', () => {
  const removed = [];
  const actions = ['check-update','backup','restore','reset','rollback'];
  const root = {
    innerHTML:'',
    addEventListener(){},
    removeEventListener(){},
    querySelectorAll(selector) {
      if (selector !== '[data-settings-action]') return [];
      return actions.map(action => ({
        dataset:{ settingsAction:action },
        remove(){ removed.push(action); },
      }));
    },
  };
  const app = createBrowserApp({
    root,
    initialRoute:{ top:'settings', manualHouse:null },
    model:{ settings:{ version:'2.0.2', rollbackSupported:false, operations:{ async checkUpdate(){} } } },
  });
  app.start();
  app.stop();
  assert.equal(removed.includes('check-update'), false);
  assert.deepEqual(new Set(removed), new Set(['backup','restore','reset','rollback']));
});

test('single navigation owner binds browser history so system Back restores the previous LIGHTHOUSE route', () => {
  const source = fs.readFileSync(new URL('../src/browser-app.mjs', import.meta.url), 'utf8');
  assert.match(source, /history\.pushState/);
  assert.match(source, /addEventListener\('popstate'/);
  assert.match(source, /removeEventListener\('popstate'/);
});
