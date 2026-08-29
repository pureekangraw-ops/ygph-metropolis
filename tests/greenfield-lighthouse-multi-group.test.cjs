"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const PASSPHRASE = 'correct horse battery staple';

function imported(record) {
  return { record, provenance:{ origin:'EVIDENCE_IMPORT' }, history:[] };
}

async function stateAt(revision = 7, seed = () => {}) {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const state = createGreenfieldState({ now:'2026-08-29T10:00:00.000Z' });
  state.revision = revision;
  seed(state);
  return state;
}

function runtimeFor(state) {
  let mutationCalls = 0;
  return {
    async readState() { return structuredClone(state); },
    async executeMultiGroupCommands() { mutationCalls += 1; throw new Error('MUTATION_MUST_NOT_RUN'); },
    mutationCalls() { return mutationCalls; },
  };
}

async function durableRuntime(seed = () => {}) {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-29T10:00:00.000Z' });
  state.domains.LEDGER.records.CURRENT = imported({
    recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0,
    calculation:{ openingBalanceSatang:0 },
  });
  seed(state);
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  const runtime = createGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => '2026-08-29T10:30:00.000Z' });
  await runtime.readState();
  return {
    runtime,
    read:() => readEncryptedState({ store, passphrase:PASSPHRASE }),
  };
}

function paymentGroup(overrides = {}) {
  return {
    groupId:'G-PAY', action:'APPLY', object:'CUSTOMER_PAYMENT',
    fields:{ amountSatang:12000, ledgerTransactionId:'TX-PAY' },
    references:{
      saleId:{ type:'EXPLICIT_ID', domain:'STORE', recordId:'SALE-104' },
      queueId:{ type:'EXPLICIT_ID', domain:'CALENDAR', recordId:'Q-SALE-104' },
    },
    dependsOn:[], requiredResult:{ kind:'CUSTOMER_PAYMENT' }, confirmation:'NOT_REQUIRED',
    ...overrides,
  };
}

function saleGroup(overrides = {}) {
  return {
    groupId:'G-SALE', action:'CREATE', object:'SALE',
    fields:{ title:'ลูกค้าเอ', amountSatang:30000, quantity:5, receivedSatang:18000, dueDate:'2026-08-30' },
    references:{}, dependsOn:[], requiredResult:{ kind:'SALE' }, confirmation:'NOT_REQUIRED',
    ...overrides,
  };
}

function plan(groups, overrides = {}) {
  return { version:'1', planId:'MG-PREFLIGHT', baseRevision:7, groups, ...overrides };
}

test('MG06 missing explicit reference returns NEEDS_INFO and never calls mutation runtime', async () => {
  const { prepareMultiGroupPlan } = await import('../lighthouse/multi-group-execution.mjs');
  const state = await stateAt(7, current => {
    current.domains.CALENDAR.records['Q-SALE-104'] = imported({
      recordId:'Q-SALE-104', type:'RECEIVE_CUSTOMER_PAYMENT', title:'รับเงินลูกค้า',
      detail:'STORE/SALE-104', amountSatang:12000, paidSatang:0, status:'OPEN',
    });
  });
  const runtime = runtimeFor(state);
  const result = await prepareMultiGroupPlan(runtime, plan([paymentGroup()]));
  assert.equal(result.status, 'NEEDS_INFO');
  assert.equal(result.groupId, 'G-PAY');
  assert.equal(result.reference, 'saleId');
  assert.equal(runtime.mutationCalls(), 0);
});

test('MG06 query-based reference with multiple matches returns AMBIGUOUS and never calls mutation runtime', async () => {
  const { prepareMultiGroupPlan } = await import('../lighthouse/multi-group-execution.mjs');
  const state = await stateAt(7, current => {
    current.domains.STORE.records.A = imported({ recordId:'SALE-A', type:'SALE', title:'ลูกค้าเอ', amountSatang:30000, quantity:5, status:'PARTIAL' });
    current.domains.STORE.records.B = imported({ recordId:'SALE-B', type:'SALE', title:'ลูกค้าเอ', amountSatang:30000, quantity:5, status:'PARTIAL' });
    current.domains.CALENDAR.records.Q = imported({ recordId:'Q-SALE-104', type:'RECEIVE_CUSTOMER_PAYMENT', title:'รับเงินลูกค้า', detail:'STORE/SALE-A', amountSatang:12000, paidSatang:0, status:'OPEN' });
  });
  const runtime = runtimeFor(state);
  const result = await prepareMultiGroupPlan(runtime, plan([paymentGroup({
    references:{
      saleId:{ type:'QUERY_BASED', domain:'STORE', where:{ type:'SALE', title:'ลูกค้าเอ' } },
      queueId:{ type:'EXPLICIT_ID', domain:'CALENDAR', recordId:'Q-SALE-104' },
    },
  })]));
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.groupId, 'G-PAY');
  assert.equal(result.reference, 'saleId');
  assert.equal(result.matches, 2);
  assert.equal(runtime.mutationCalls(), 0);
});

test('unsupported capability blocks the whole plan before mutation', async () => {
  const { prepareMultiGroupPlan } = await import('../lighthouse/multi-group-execution.mjs');
  const state = await stateAt();
  const runtime = runtimeFor(state);
  const result = await prepareMultiGroupPlan(runtime, plan([saleGroup(), {
    groupId:'G-DELETE', action:'DELETE', object:'TEST_ORDER', fields:{ recordId:'TEST-ORDER' }, references:{},
    dependsOn:['G-SALE'], requiredResult:{ kind:'DELETE' }, confirmation:'CONFIRMED',
  }]));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.groupId, 'G-DELETE');
  assert.equal(result.reason, 'CAPABILITY_NOT_CONNECTED');
  assert.equal(runtime.mutationCalls(), 0);
});

test('required confirmation returns AWAITING_CONFIRMATION before mutation', async () => {
  const { prepareMultiGroupPlan } = await import('../lighthouse/multi-group-execution.mjs');
  const runtime = runtimeFor(await stateAt());
  const result = await prepareMultiGroupPlan(runtime, plan([saleGroup({ confirmation:'REQUIRED' })]));
  assert.equal(result.status, 'AWAITING_CONFIRMATION');
  assert.equal(result.groupId, 'G-SALE');
  assert.equal(runtime.mutationCalls(), 0);
});

test('forward dependency is blocked instead of reordering meaning after the fact', async () => {
  const { prepareMultiGroupPlan } = await import('../lighthouse/multi-group-execution.mjs');
  const runtime = runtimeFor(await stateAt());
  const result = await prepareMultiGroupPlan(runtime, plan([
    saleGroup({ groupId:'G-FIRST', dependsOn:['G-LATER'] }),
    saleGroup({ groupId:'G-LATER' }),
  ]));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.groupId, 'G-FIRST');
  assert.equal(result.reason, 'INVALID_DEPENDENCY_ORDER');
  assert.equal(runtime.mutationCalls(), 0);
});

test('MG04 atomic runtime failure in a later command leaves durable state and revision unchanged', async () => {
  const { runtime, read } = await durableRuntime(state => {
    state.domains.STORE.records.P1 = imported({ recordId:'P1', type:'PURCHASE', title:'stock', amountSatang:50000, quantity:5, status:'ACTIVE' });
    state.domains.LEDGER.records['TX-DUP'] = imported({ recordId:'TX-DUP', type:'TRANSACTION', direction:'IN', amountSatang:1, title:'existing', subtype:'OTHER_INCOME', status:'POSTED' });
  });
  const before = await read();
  const commands = [
    { commandId:'MG04:1', idempotencyKey:'MG04:G1:STORE', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'SALE-MG04', type:'SALE', title:'atomic', amountSatang:10000, totalSatang:10000, receivedSatang:10000, outstandingSatang:0, quantity:1, status:'COMPLETED' } } },
    { commandId:'MG04:2', idempotencyKey:'MG04:G1:LEDGER', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{ recordId:'TX-DUP', direction:'IN', amountSatang:10000, title:'duplicate later command', subtype:'SALE', sourceRef:'STORE/SALE-MG04' } },
  ];
  await assert.rejects(runtime.executeMultiGroupCommands({ baseRevision:before.revision, commands }), /DUPLICATE_DOMAIN_RECORD/);
  assert.deepEqual(await read(), before);
});

test('MG05 identical retry recovers from commandLog without duplicate durable mutation', async () => {
  const { runtime, read } = await durableRuntime();
  const before = await read();
  const commands = [{
    commandId:'MG05:1', idempotencyKey:'MG05:G1:LEDGER', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION',
    payload:{ recordId:'TX-MG05', direction:'IN', amountSatang:500, title:'retry', subtype:'OTHER_INCOME', sourceRef:'LEDGER/MANUAL' },
  }];
  const first = await runtime.executeMultiGroupCommands({ baseRevision:before.revision, commands });
  assert.equal(first.status, 'VERIFIED');
  const afterFirst = await read();
  const retry = await runtime.executeMultiGroupCommands({ baseRevision:before.revision, commands });
  assert.equal(retry.status, 'RECOVERED');
  const afterRetry = await read();
  assert.deepEqual(afterRetry, afterFirst);
  assert.equal(Object.keys(afterRetry.commandLog).filter(key => key === 'MG05:G1:LEDGER').length, 1);
});

test('MG07 stale baseRevision is rejected before any plan command commits', async () => {
  const { runtime, read } = await durableRuntime();
  const planned = await read();
  await runtime.otherIncome({ workflowId:'WF-BUMP', ledgerTransactionId:'TX-BUMP', title:'revision bump', amountSatang:100 });
  const afterBump = await read();
  const result = await runtime.executeMultiGroupCommands({ baseRevision:planned.revision, commands:[{
    commandId:'MG07:1', idempotencyKey:'MG07:G1:LEDGER', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION',
    payload:{ recordId:'TX-MG07', direction:'IN', amountSatang:700, title:'stale', subtype:'OTHER_INCOME', sourceRef:'LEDGER/MANUAL' },
  }] });
  assert.equal(result.status, 'STALE');
  assert.equal(result.reason, 'MULTI_GROUP_STALE_BASE_REVISION');
  const finalState = await read();
  assert.equal(finalState.revision, afterBump.revision);
  assert.equal(finalState.domains.LEDGER.records['TX-MG07'], undefined);
});
