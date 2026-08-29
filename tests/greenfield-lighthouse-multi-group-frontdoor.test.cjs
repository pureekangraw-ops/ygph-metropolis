"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const PASSPHRASE = 'correct horse battery staple';

function imported(record) {
  return { record, provenance:{ origin:'EVIDENCE_IMPORT' }, history:[] };
}

async function durableRuntime() {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-29T10:00:00.000Z' });
  state.domains.LEDGER.records.CURRENT = imported({
    recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0,
    calculation:{ openingBalanceSatang:0 },
  });
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  const runtime = createGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => '2026-08-29T10:30:00.000Z' });
  await runtime.readState();
  return { runtime, read:() => readEncryptedState({ store, passphrase:PASSPHRASE }) };
}

test('MG01 natural-language multi-group remains stopped and durable state does not change', async () => {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  const { runtime, read } = await durableRuntime();
  const before = await read();
  let providerCalls = 0;

  const routed = await routeMasterInputText('ลงข้าว65 แล้วลงน้ำมัน500', {
    receivedAt:'2026-08-29T10:30:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:() => 'MG01-REQ',
    interpretFallback:async () => { providerCalls += 1; throw new Error('PROVIDER_MUST_NOT_RUN'); },
  });

  assert.equal(routed.route, 'STOP');
  assert.equal(routed.decision.route, 'INTERPRET');
  assert.equal(routed.reason, 'MULTI_GROUP_EXECUTION_NOT_CONNECTED');
  assert.equal(routed.prepared.request, null);
  assert.equal(providerCalls, 0);
  assert.deepEqual(await read(), before);
  runtime.close();
});
