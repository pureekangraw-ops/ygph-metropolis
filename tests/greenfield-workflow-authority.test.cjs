"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function setup(seed) {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-13T06:55:00.000Z' });
  seed(state);
  await commitEncryptedState({ store, passphrase:'correct horse battery staple', state, expectedDurableRevision:null });
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now:()=> '2026-08-13T06:56:00.000Z' });
  return { store, runtime };
}

function entry(record) {
  return { record, provenance:{ origin:'EVIDENCE_IMPORT' }, history:[] };
}

function sale(id) {
  return entry({ recordId:id, source:'STORE', type:'SALE', title:id, amountSatang:5000, totalSatang:5000, receivedSatang:0, outstandingSatang:5000, quantity:1, status:'OPEN' });
}

function stock(quantity = 2) {
  return entry({ recordId:'P-BASE', source:'STORE', type:'PURCHASE', title:'stock baseline', amountSatang:10000, quantity, status:'ACTIVE' });
}

test('workflow authority validates a Calendar queue created inside the same plan before any mutation', async () => {
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { store, runtime } = await setup(state => {
    state.domains.STORE.records.P_BASE = stock(2);
    state.domains.STORE.records.SALE_A = sale('SALE_A');
    state.domains.STORE.records.SALE_B = sale('SALE_B');
  });
  const before = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  await assert.rejects(executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'S1', idempotencyKey:'PLAN:S', domain:'STORE', type:'STORE_APPLY_RECEIVABLE_PAYMENT', payload:{ recordId:'SALE_A', amountSatang:1000 } },
    { commandId:'L1', idempotencyKey:'PLAN:L', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{ recordId:'TX-PLAN', direction:'IN', amountSatang:1000, title:'รับ A', subtype:'SALE_RECEIPT', sourceRef:'STORE/SALE_A' } },
    { commandId:'C0', idempotencyKey:'PLAN:C0', domain:'CALENDAR', type:'CALENDAR_CREATE_RECORD', payload:{ record:{ recordId:'Q-NEW', type:'RECEIVE_CUSTOMER_PAYMENT', title:'รับ B', detail:'STORE/SALE_B', amountSatang:5000, paidSatang:0, status:'OPEN' } } },
    { commandId:'C1', idempotencyKey:'PLAN:C1', domain:'CALENDAR', type:'CALENDAR_APPLY_PAYMENT', payload:{ recordId:'Q-NEW', amountSatang:1000 } }
  ]}), /WORKFLOW_QUEUE_SOURCE_MISMATCH/);
  assert.deepEqual(await readEncryptedState({ store, passphrase:'correct horse battery staple' }), before);
});

test('workflow authority fails closed on multiple payment relations until an explicit keyed multi-payment contract exists', async () => {
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { store, runtime } = await setup(state => {
    state.domains.STORE.records.P_BASE = stock(2);
    state.domains.STORE.records.SALE_A = sale('SALE_A');
    state.domains.STORE.records.SALE_B = sale('SALE_B');
    state.domains.CALENDAR.records.Q_A = entry({ recordId:'Q_A', source:'CALENDAR', type:'RECEIVE_CUSTOMER_PAYMENT', title:'รับ A', detail:'STORE/SALE_A', amountSatang:5000, paidSatang:0, status:'OPEN' });
    state.domains.CALENDAR.records.Q_B = entry({ recordId:'Q_B', source:'CALENDAR', type:'RECEIVE_CUSTOMER_PAYMENT', title:'รับ B', detail:'STORE/SALE_B', amountSatang:5000, paidSatang:0, status:'OPEN' });
  });
  const before = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  await assert.rejects(executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'S1', idempotencyKey:'MULTI:S1', domain:'STORE', type:'STORE_APPLY_RECEIVABLE_PAYMENT', payload:{ recordId:'SALE_A', amountSatang:1000 } },
    { commandId:'S2', idempotencyKey:'MULTI:S2', domain:'STORE', type:'STORE_APPLY_RECEIVABLE_PAYMENT', payload:{ recordId:'SALE_B', amountSatang:1000 } },
    { commandId:'C1', idempotencyKey:'MULTI:C1', domain:'CALENDAR', type:'CALENDAR_APPLY_PAYMENT', payload:{ recordId:'Q_A', amountSatang:1000 } },
    { commandId:'C2', idempotencyKey:'MULTI:C2', domain:'CALENDAR', type:'CALENDAR_APPLY_PAYMENT', payload:{ recordId:'Q_B', amountSatang:1000 } }
  ]}), /WORKFLOW_PAYMENT_RELATION_AMBIGUOUS/);
  assert.deepEqual(await readEncryptedState({ store, passphrase:'correct horse battery staple' }), before);
});
