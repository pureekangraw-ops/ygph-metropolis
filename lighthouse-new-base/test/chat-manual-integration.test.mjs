import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenseChatBridge } from '../src/chat-expense-bridge.mjs';
import { createChatStore } from '../src/chat-store.mjs';
import { createChatController } from '../src/chat-controller.mjs';
import { createBrowserModel } from '../src/browser-model.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function fakeRuntime() {
  const records = {};
  return {
    async expense(input) {
      const record = {
        recordId: input.ledgerTransactionId,
        type:'TRANSACTION',
        direction:'OUT',
        subtype:'EXPENSE',
        title:input.title,
        amountSatang:input.amountSatang,
        createdAt:'2026-09-03T03:00:00.000Z',
      };
      records[record.recordId] = { record };
      return { record };
    },
    async readState() {
      return {
        revision:Object.keys(records).length,
        domains:{
          LEDGER:{ records },
          CALENDAR:{ records:{} },
          RIDE:{ records:{} },
          STORE:{ records:{} },
        },
      };
    },
  };
}

test('CHAT confirmed expense and MANUAL projections read the exact same durable Ledger record', async () => {
  const runtime = fakeRuntime();
  const bridgeFactory = () => createExpenseChatBridge({ runtime, requestIdFactory:() => 'REQ-chat-manual-proof' });
  const chat = createChatController({
    store:createChatStore({ storage:memoryStorage() }),
    interpret:text => bridgeFactory().interpret(text),
    commit:draft => bridgeFactory().commit(draft),
    readback:(result, draft) => bridgeFactory().readback(result, draft),
  });

  const sent = await chat.send('ข้าว 65');
  await chat.confirm(sent.pending.messageId);

  const model = createBrowserModel({
    runtimeProvider:fn => fn(runtime),
    dailyControls:{ async getSpendingAllowance() { return null; } },
  });
  const projected = await model.read({ date:'2026-09-03', year:2026, month:9 });

  assert.equal(projected.outcome.spentSatang, 6500);
  assert.equal(projected.manual.summary.moneyOutSatang, 6500);
  assert.equal(projected.ledger.balanceSatang, -6500);
  assert.equal(projected.ledger.history.length, 1);
  assert.equal(projected.ledger.history[0].recordId, 'TX-LH-REQ-chat-manual-proof');
  assert.equal(projected.ledger.history[0].sourceRecord, (await runtime.readState()).domains.LEDGER.records['TX-LH-REQ-chat-manual-proof'].record);
});
