"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function initializedStore(seed = () => {}) {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-12T10:00:00.000Z' });
  state.domains.LEDGER.records.CURRENT = { record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0, calculation:{ openingBalanceSatang:0 } }, provenance:{ origin:'EVIDENCE_IMPORT' } };
  seed(state);
  await commitEncryptedState({ store, passphrase:'correct horse battery staple', state, expectedDurableRevision:null });
  return store;
}

async function workflowRuntime() {
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-12T10:30:00.000Z' });
  return runtime;
}

function imported(record) {
  return { record, provenance:{ origin:'EVIDENCE_IMPORT' }, history:[] };
}

function stockPurchase(recordId, quantity) {
  return imported({ recordId, source:'STORE', type:'PURCHASE', title:'ของเข้า', amountSatang:10000, quantity, status:'ACTIVE' });
}

test('atomic workflow commits Store + Ledger commands in one durable write', async () => {
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { readEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = await initializedStore(state => { state.domains.STORE.records.P1 = stockPurchase('P1', 1); });
  const runtime = await workflowRuntime();
  const result = await executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'S1', idempotencyKey:'SALE:1', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'SALE1', type:'SALE', title:'ขายเงินสด', amountSatang:10000, quantity:1, status:'COMPLETED' } } },
    { commandId:'L1', idempotencyKey:'SALE:1:LEDGER', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{ recordId:'TX1', direction:'IN', amountSatang:10000, title:'ขายเงินสด', subtype:'SALE', sourceRef:'STORE/SALE1' } }
  ]});
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.fromRevision, 1);
  assert.equal(result.toRevision, 3);
  assert.equal(result.appliedCommands, 2);
  const durable = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  assert.ok(durable.domains.STORE.records.SALE1);
  assert.ok(durable.domains.LEDGER.records.TX1);
});

test('atomic workflow writes nothing when a later command fails', async () => {
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { readEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = await initializedStore(state => { state.domains.STORE.records.P1 = stockPurchase('P1', 2); });
  const before = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  const runtime = await workflowRuntime();
  await assert.rejects(executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'S1', idempotencyKey:'SALE:1', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'SALE1', type:'SALE', title:'ขายเงินสด', amountSatang:10000, quantity:1, status:'COMPLETED' } } },
    { commandId:'S2', idempotencyKey:'SALE:2', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'SALE1', type:'SALE', title:'ซ้ำ', amountSatang:10000, quantity:1, status:'COMPLETED' } } }
  ]}), /DUPLICATE_DOMAIN_RECORD/);
  const after = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  assert.deepEqual(after, before);
});

test('receivable payment rejects a Calendar queue belonging to a different Store sale and writes nothing', async () => {
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { readEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = await initializedStore(state => {
    state.domains.STORE.records.SALE_A = imported({ recordId:'SALE_A', source:'STORE', type:'SALE', title:'A', amountSatang:5000, totalSatang:5000, receivedSatang:0, outstandingSatang:5000, quantity:1, status:'OPEN' });
    state.domains.STORE.records.SALE_B = imported({ recordId:'SALE_B', source:'STORE', type:'SALE', title:'B', amountSatang:5000, totalSatang:5000, receivedSatang:0, outstandingSatang:5000, quantity:1, status:'OPEN' });
    state.domains.CALENDAR.records.Q_A = imported({ recordId:'Q_A', source:'CALENDAR', type:'RECEIVE_CUSTOMER_PAYMENT', title:'รับ A', detail:'STORE/SALE_A', amountSatang:5000, paidSatang:0, status:'OPEN' });
    state.domains.CALENDAR.records.Q_B = imported({ recordId:'Q_B', source:'CALENDAR', type:'RECEIVE_CUSTOMER_PAYMENT', title:'รับ B', detail:'STORE/SALE_B', amountSatang:5000, paidSatang:0, status:'OPEN' });
  });
  const before = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  const runtime = await workflowRuntime();
  await assert.rejects(executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'S1', idempotencyKey:'RCV:S', domain:'STORE', type:'STORE_APPLY_RECEIVABLE_PAYMENT', payload:{ recordId:'SALE_A', amountSatang:1000 } },
    { commandId:'L1', idempotencyKey:'RCV:L', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{ recordId:'TX-RCV', direction:'IN', amountSatang:1000, title:'รับ A', subtype:'SALE_RECEIPT', sourceRef:'STORE/SALE_A' } },
    { commandId:'C1', idempotencyKey:'RCV:C', domain:'CALENDAR', type:'CALENDAR_APPLY_PAYMENT', payload:{ recordId:'Q_B', amountSatang:1000 } }
  ]}), /WORKFLOW_QUEUE_SOURCE_MISMATCH/);
  assert.deepEqual(await readEncryptedState({ store, passphrase:'correct horse battery staple' }), before);
});

test('obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing', async () => {
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { readEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = await initializedStore(state => {
    state.domains.LEDGER.records.OBL_A = imported({ recordId:'OBL_A', source:'LEDGER', type:'OBLIGATION', title:'A', amountSatang:5000, originalSatang:5000, paidSatang:0, remainingSatang:5000, status:'OPEN' });
    state.domains.LEDGER.records.OBL_B = imported({ recordId:'OBL_B', source:'LEDGER', type:'OBLIGATION', title:'B', amountSatang:5000, originalSatang:5000, paidSatang:0, remainingSatang:5000, status:'OPEN' });
    state.domains.CALENDAR.records.Q_A = imported({ recordId:'Q_A', source:'CALENDAR', type:'PAY_OBLIGATION', title:'จ่าย A', detail:'LEDGER/OBL_A', amountSatang:5000, paidSatang:0, status:'OPEN' });
    state.domains.CALENDAR.records.Q_B = imported({ recordId:'Q_B', source:'CALENDAR', type:'PAY_OBLIGATION', title:'จ่าย B', detail:'LEDGER/OBL_B', amountSatang:5000, paidSatang:0, status:'OPEN' });
  });
  const before = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  const runtime = await workflowRuntime();
  await assert.rejects(executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'O1', idempotencyKey:'PAY:O', domain:'LEDGER', type:'LEDGER_APPLY_OBLIGATION_PAYMENT', payload:{ recordId:'OBL_A', amountSatang:1000 } },
    { commandId:'L1', idempotencyKey:'PAY:L', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{ recordId:'TX-PAY', direction:'OUT', amountSatang:1000, title:'จ่าย A', subtype:'OBLIGATION_PAYMENT', sourceRef:'LEDGER/OBL_A' } },
    { commandId:'C1', idempotencyKey:'PAY:C', domain:'CALENDAR', type:'CALENDAR_APPLY_PAYMENT', payload:{ recordId:'Q_B', amountSatang:1000 } }
  ]}), /WORKFLOW_QUEUE_SOURCE_MISMATCH/);
  assert.deepEqual(await readEncryptedState({ store, passphrase:'correct horse battery staple' }), before);
});

for (const [name, record] of [
  ['sale', { recordId:'SALE-UNDER', type:'SALE', title:'ขายเกิน', amountSatang:10000, quantity:3, status:'COMPLETED' }],
  ['withdrawal', { recordId:'WD-UNDER', type:'STOCK_WITHDRAWAL', title:'เบิกเกิน', amountSatang:0, quantity:3, status:'COMPLETED' }],
  ['negative adjustment', { recordId:'ADJ-UNDER', type:'STOCK_ADJUSTMENT', title:'ปรับลงเกิน', detail:'นับจริง', reason:'นับจริง', amountSatang:null, quantity:-3, status:'COMPLETED' }],
]) {
  test(`${name} workflow rejects projected Store stock below zero and writes nothing`, async () => {
    const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
    const { readEncryptedState } = await import('../greenfield/persistence.mjs');
    const store = await initializedStore(state => { state.domains.STORE.records.P1 = stockPurchase('P1', 2); });
    const before = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
    const runtime = await workflowRuntime();
    await assert.rejects(executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
      { commandId:'S1', idempotencyKey:`STOCK:${name}`, domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record } }
    ]}), /STORE_STOCK_UNDERFLOW/);
    assert.deepEqual(await readEncryptedState({ store, passphrase:'correct horse battery staple' }), before);
  });
}

test('Store workflow allows final projected stock exactly zero', async () => {
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const store = await initializedStore(state => { state.domains.STORE.records.P1 = stockPurchase('P1', 2); });
  const runtime = await workflowRuntime();
  const result = await executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'S1', idempotencyKey:'SALE:ZERO', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'SALE-ZERO', type:'SALE', title:'ขายหมด', amountSatang:10000, quantity:2, status:'COMPLETED' } } }
  ]});
  assert.equal(result.status, 'VERIFIED');
});

test('Store workflow may repair a negative imported baseline when the committed final stock is non-negative', async () => {
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const store = await initializedStore(state => {
    state.domains.STORE.records.P1 = stockPurchase('P1', 1);
    state.domains.STORE.records.S1 = imported({ recordId:'S1', source:'STORE', type:'SALE', title:'legacy mismatch', amountSatang:10000, quantity:2, status:'COMPLETED' });
  });
  const runtime = await workflowRuntime();
  const result = await executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'A1', idempotencyKey:'ADJ:REPAIR', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'ADJ-REPAIR', type:'STOCK_ADJUSTMENT', title:'ปรับยอด', detail:'แก้ baseline', reason:'แก้ baseline', amountSatang:null, quantity:1, status:'COMPLETED' } } }
  ]});
  assert.equal(result.status, 'VERIFIED');
});
