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

test('FD01 compiler splits two proven direct expenses into independent READY boxes', async () => {
  const { parseIntentTask1 } = await import('../lighthouse/intent-parser.mjs');
  const { compileNaturalLanguageMultiGroup } = await import('../lighthouse/multi-group-frontdoor.mjs');
  const parsed = parseIntentTask1('ข้าว65ข้าว500');
  assert.equal(parsed.status, 'PARSED');
  assert.equal(parsed.groups.length, 2);

  let nextId = 0;
  const compiled = compileNaturalLanguageMultiGroup(parsed, {
    baseRevision:1,
    requestIdFactory:() => `FD01-${++nextId}`,
  });

  assert.equal(compiled.status, 'READY');
  assert.deepEqual(compiled.commands.map(item => item.status), ['READY','READY']);
  assert.deepEqual(compiled.commands.map(item => item.groupId), ['G1','G2']);
  assert.equal(compiled.boxes.length, 2);
  assert.ok(compiled.boxes.every(box => box.relationship === 'INDEPENDENT'));
  assert.ok(compiled.boxes.every(box => box.plan.version === '1'));
  assert.ok(compiled.boxes.every(box => box.plan.baseRevision === 1));
  assert.deepEqual(compiled.boxes.map(box => box.plan.groups[0].object), ['EXPENSE','EXPENSE']);
  assert.deepEqual(compiled.boxes.map(box => box.plan.groups[0].fields.amountSatang), [6500,50000]);
});

test('FD02 understood condition is BLOCKED rather than guessed or reported as runtime ERROR', async () => {
  const { parseIntentTask1 } = await import('../lighthouse/intent-parser.mjs');
  const { compileNaturalLanguageMultiGroup } = await import('../lighthouse/multi-group-frontdoor.mjs');
  const parsed = parseIntentTask1('ถ้าฝนตกค่อยลงข้าว65');
  assert.equal(parsed.groups.length, 1);
  assert.equal(parsed.groups[0].condition?.state, 'RESOLVED');

  const compiled = compileNaturalLanguageMultiGroup(parsed, {
    baseRevision:1,
    requestIdFactory:() => 'FD02',
  });

  assert.equal(compiled.status, 'BLOCKED');
  assert.equal(compiled.boxes.length, 0);
  assert.equal(compiled.commands.length, 1);
  assert.equal(compiled.commands[0].status, 'BLOCKED');
  assert.equal(compiled.commands[0].reason, 'CONDITION_NOT_SUPPORTED');
});

test('MG01 natural-language multi-group remains stopped and durable state does not change', async () => {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  const { runtime, read } = await durableRuntime();
  const before = await read();
  let providerCalls = 0;

  const routed = await routeMasterInputText('ข้าว65ข้าว500', {
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
