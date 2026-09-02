import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatSession } from '../src/chat-session.mjs';
import { createExpenseChatBridge } from '../src/chat-expense-bridge.mjs';

function fakeRuntime() {
  const records = {};
  let writes = 0;
  return {
    get writes() { return writes; },
    async expense(input) {
      writes += 1;
      records[input.ledgerTransactionId] = {
        record: {
          recordId: input.ledgerTransactionId,
          type: 'TRANSACTION',
          direction: 'OUT',
          subtype: 'EXPENSE',
          title: input.title,
          amountSatang: input.amountSatang,
        },
      };
    },
    async readState() {
      return { revision: writes, domains: { LEDGER: { records } } };
    },
  };
}

test('approved core expense logic is adapted into CHAT without importing legacy UI', async () => {
  const runtime = fakeRuntime();
  const bridge = createExpenseChatBridge({ runtime, requestIdFactory: () => 'REQ-new-base-1' });
  const chat = createChatSession(bridge);

  const draft = await chat.receive('ข้าว 65');
  assert.equal(runtime.writes, 0);
  assert.equal(draft.pending.owner, 'outcome');
  assert.equal(draft.pending.action, 'expense');

  const done = await chat.receive('ยืนยัน');
  assert.equal(runtime.writes, 1);
  assert.equal(done.pending, null);
  assert.equal(done.messages.at(-1).text, 'บันทึกแล้ว');
  assert.equal(bridge.lastReadback().recordId, 'TX-LH-REQ-new-base-1');
  assert.equal(bridge.lastReadback().amountSatang, 6500);
});

test('unmatched text stays a conversation result and never mutates Runtime', async () => {
  const runtime = fakeRuntime();
  const bridge = createExpenseChatBridge({ runtime, requestIdFactory: () => 'REQ-new-base-2' });
  const chat = createChatSession(bridge);

  const result = await chat.receive('ไม่ใช่รายการเงิน');
  assert.equal(runtime.writes, 0);
  assert.equal(result.pending, null);
  assert.equal(result.messages.at(-1).side, 'assistant');
  assert.notEqual(result.messages.at(-1).text, 'บันทึกแล้ว');
});
