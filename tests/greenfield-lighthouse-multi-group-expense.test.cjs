"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const PASSPHRASE = 'correct horse battery staple';

function imported(record) {
  return { record, provenance:{ origin:'EVIDENCE_IMPORT' }, history:[] };
}

async function durableRuntime(seed = () => {}) {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-30T02:30:00.000Z' });
  state.domains.LEDGER.records.CURRENT = imported({
    recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:100000,
    calculation:{ openingBalanceSatang:100000 },
  });
  seed(state);
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  const runtime = createGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => '2026-08-30T02:31:00.000Z' });
  await runtime.readState();
  return { runtime, read:() => readEncryptedState({ store, passphrase:PASSPHRASE }) };
}

function expenseGroup(groupId, title, amountSatang, fields = {}) {
  return {
    groupId,
    action:'CREATE',
    object:'EXPENSE',
    fields:{ title, amountSatang, ...fields },
    references:{},
    dependsOn:[],
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{ direction:'OUT', subtype:'EXPENSE', title, amountSatang },
    },
    confirmation:'NOT_REQUIRED',
  };
}

function plan(baseRevision, groups, planId = 'FD-EXPENSE') {
  return { version:'1', planId, baseRevision, groups };
}

test('FD06 CREATE/EXPENSE multi-group capability commits deterministic ledger transaction and proves durable readback', async () => {
  const { executeMultiGroupPlan } = await import('../lighthouse/multi-group-execution.mjs');
  const { runtime, read } = await durableRuntime();
  const before = await read();

  const result = await executeMultiGroupPlan(runtime, plan(before.revision, [expenseGroup('G1', 'ข้าว', 6500)]));

  assert.equal(result.status, 'COMPLETE');
  const durable = await read();
  const transactionId = 'MG-FD-EXPENSE-G1-TX-EXPENSE';
  const record = durable.domains.LEDGER.records[transactionId]?.record;
  assert.equal(record.recordId, transactionId);
  assert.equal(record.direction, 'OUT');
  assert.equal(record.subtype, 'EXPENSE');
  assert.equal(record.title, 'ข้าว');
  assert.equal(record.amountSatang, 6500);
  assert.equal(record.sourceRef, 'LEDGER/MANUAL');
  assert.ok(result.readback.groups.some(item => item.domain === 'LEDGER' && item.recordId === transactionId));
});

test('FD07 later expense command failure leaves a related atomic plan durable state unchanged', async () => {
  const { executeMultiGroupPlan } = await import('../lighthouse/multi-group-execution.mjs');
  const { runtime, read } = await durableRuntime(state => {
    state.domains.LEDGER.records['TX-DUP'] = imported({
      recordId:'TX-DUP', type:'TRANSACTION', direction:'IN', amountSatang:1,
      title:'existing', subtype:'OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'POSTED',
    });
  });
  const before = await read();
  const request = plan(before.revision, [
    expenseGroup('G1', 'ข้าว', 6500),
    expenseGroup('G2', 'ข้าว', 5000, { ledgerTransactionId:'TX-DUP' }),
  ], 'FD-ATOMIC-EXPENSE');

  await assert.rejects(executeMultiGroupPlan(runtime, request), /DUPLICATE_DOMAIN_RECORD/);
  assert.deepEqual(await read(), before);
});
