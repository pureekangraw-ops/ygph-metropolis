import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatService } from '../app/public/logic/chat/chat-service.mjs';

function memoryMetadataStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async put(key, value) { values.set(key, structuredClone(value)); },
  };
}

test('CHAT LEDGER_COMMAND uses Ledger Gateway and requires verified readback', async () => {
  const calls = [];
  const chat = createChatService({
    store:memoryMetadataStore(),
    modules:{ execute:async () => ({ status:'VERIFIED', readback:{} }) },
    ledger:{ execute:async input => { calls.push(structuredClone(input)); return { status:'VERIFIED', readback:{ ledger:true } }; } },
  });
  const response = await chat.dispatch({
    requestId:'REQ-LEDGER-1',
    route:'LEDGER_COMMAND',
    payload:{ operation:'addIncome', payload:{ amountSatang:50000 } },
  });
  assert.equal(response.status, 'SUCCESS');
  assert.equal(response.result.readback.ledger, true);
  assert.deepEqual(calls, [{ operation:'addIncome', payload:{ amountSatang:50000 } }]);
});
