"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

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
