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
  const state = createGreenfieldState({ now:'2026-08-30T03:00:00.000Z' });
  state.domains.LEDGER.records.CURRENT = imported({
    recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:100000,
    calculation:{ openingBalanceSatang:100000 },
  });
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  const runtime = createGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => '2026-08-30T03:01:00.000Z' });
  await runtime.readState();
  return { runtime, read:() => readEncryptedState({ store, passphrase:PASSPHRASE }) };
}

async function routeTwoExpenses(baseRevision) {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  let nextId = 0;
  return routeMasterInputText('ข้าว65ข้าว500', {
    receivedAt:'2026-08-30T03:00:00.000Z',
    timeZone:'Asia/Bangkok',
    baseRevision,
    requestIdFactory:() => `FD-RT-${++nextId}`,
    interpretFallback:async () => { throw new Error('PROVIDER_MUST_NOT_RUN'); },
  });
}

test('FD08 independent READY boxes re-preflight against current durable revision and complete from readback', async () => {
  const { executeFrontdoorMultiGroupBoxes } = await import('../lighthouse/multi-group-frontdoor-runtime.mjs');
  const { runtime, read } = await durableRuntime();
  const before = await read();
  const routed = await routeTwoExpenses(before.revision);
  assert.equal(routed.route, 'LOCAL_MULTI_GROUP');

  await runtime.otherIncome({ workflowId:'WF-BUMP-FD08', ledgerTransactionId:'TX-BUMP-FD08', title:'revision bump', amountSatang:100 });
  const bumped = await read();
  assert.ok(bumped.revision > before.revision);

  const result = await executeFrontdoorMultiGroupBoxes(runtime, routed);
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(result.commands.map(item => item.status), ['COMPLETE','COMPLETE']);
  assert.ok(result.boxes.every(box => box.preflightBaseRevision >= bumped.revision));

  const durable = await read();
  const expenseRecords = Object.values(durable.domains.LEDGER.records)
    .map(entry => entry?.record)
    .filter(record => record?.detail === 'OUT:EXPENSE');
  assert.equal(expenseRecords.length, 2);
  assert.deepEqual(expenseRecords.map(record => record.amountSatang).sort((a,b) => a-b), [6500,50000]);
});

test('FD09 non-ready child is preserved and never executed as part of another independent box', async () => {
  const { executeFrontdoorMultiGroupBoxes } = await import('../lighthouse/multi-group-frontdoor-runtime.mjs');
  const { runtime, read } = await durableRuntime();
  const before = await read();
  const routed = Object.freeze({
    route:'LOCAL_MULTI_GROUP',
    status:'MIXED',
    boxes:Object.freeze([]),
    commands:Object.freeze([
      Object.freeze({ groupId:'G1', rawText:'ข้าว', status:'WAITING', reason:'INTENT_REQUIRED_SLOT_UNRESOLVED' }),
    ]),
  });

  const result = await executeFrontdoorMultiGroupBoxes(runtime, routed);
  assert.equal(result.status, 'WAITING');
  assert.equal(result.commands[0].status, 'WAITING');
  assert.deepEqual(await read(), before);
});
