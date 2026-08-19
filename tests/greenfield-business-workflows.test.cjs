"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function runtime() {
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const rt = createCommandRuntime();
  registerGreenfieldDomainCommands(rt, { now: () => '2026-08-12T11:00:00.000Z' });
  return rt;
}

async function apply(state, commands) {
  const rt = await runtime();
  let next = state;
  for (const command of commands) next = await rt.execute(next, { ...command, expectedRevision: next.revision });
  return next;
}

test('cash sale workflow creates Store truth and Ledger cash movement with no Calendar queue', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildSaleWorkflow } = await import('../greenfield/business-workflows.mjs');
  const plan = buildSaleWorkflow({ workflowId:'WF-SALE-1', saleId:'SALE1', ledgerTransactionId:'TX1', title:'ขายเงินสด', amountSatang:20000, quantity:2, receivedSatang:20000 });
  assert.equal(plan.commands.length, 2);
  const state = await apply(createGreenfieldState(), plan.commands);
  assert.equal(state.domains.STORE.records.SALE1.record.outstandingSatang, 0);
  assert.equal(state.domains.STORE.records.SALE1.record.status, 'COMPLETED');
  assert.equal(state.domains.LEDGER.records.TX1.record.detail, 'IN:SALE');
  assert.deepEqual(Object.keys(state.domains.CALENDAR.records), []);
});

test('sale cost stays in Store and net income equals received cash minus store-borne cost', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildSaleWorkflow } = await import('../greenfield/business-workflows.mjs');
  const plan = buildSaleWorkflow({ workflowId:'WF-SALE-COST', saleId:'SALE-COST', ledgerTransactionId:'TX-COST', title:'ขายพร้อมต้นทุนร้าน', amountSatang:50000, quantity:1, receivedSatang:50000, storeCostSatang:6000 });
  const state = await apply(createGreenfieldState(), plan.commands);
  const sale = state.domains.STORE.records['SALE-COST'].record;
  assert.equal(sale.storeCostSatang, 6000);
  assert.equal(sale.netIncomeSatang, 44000);
  assert.equal(state.domains.LEDGER.records['TX-COST'].record.amountSatang, 50000);
  assert.equal(Object.values(state.domains.LEDGER.records).filter(entry => entry.record.direction === 'OUT').length, 0);
});

test('receivable sale and payment workflow keeps Calendar non-cash and closes only after atomic Ledger receipt', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildSaleWorkflow, buildReceiveCustomerPaymentWorkflow } = await import('../greenfield/business-workflows.mjs');
  let state = createGreenfieldState();
  state = await apply(state, buildSaleWorkflow({ workflowId:'WF-SALE-2', saleId:'SALE2', ledgerTransactionId:'TX-DOWN', calendarQueueId:'Q-SALE2', title:'ลูกค้า', amountSatang:30000, quantity:1, receivedSatang:10000, dueDate:'2026-08-20' }).commands);
  assert.equal(state.domains.STORE.records.SALE2.record.outstandingSatang, 20000);
  assert.equal(state.domains.CALENDAR.records['Q-SALE2'].record.amountSatang, 20000);
  assert.equal(state.domains.CALENDAR.records['Q-SALE2'].record.status, 'OPEN');
  const ledgerBeforePayment = Object.keys(state.domains.LEDGER.records).length;
  state = await apply(state, buildReceiveCustomerPaymentWorkflow({ workflowId:'WF-RCV-1', saleId:'SALE2', queueId:'Q-SALE2', ledgerTransactionId:'TX-RCV', amountSatang:20000 }).commands);
  assert.equal(state.domains.STORE.records.SALE2.record.outstandingSatang, 0);
  assert.equal(state.domains.STORE.records.SALE2.record.status, 'COMPLETED');
  assert.equal(state.domains.CALENDAR.records['Q-SALE2'].record.amountSatang, 0);
  assert.equal(state.domains.CALENDAR.records['Q-SALE2'].record.status, 'COMPLETED');
  assert.equal(Object.keys(state.domains.LEDGER.records).length, ledgerBeforePayment + 1);
  assert.equal(state.domains.LEDGER.records['TX-RCV'].record.detail, 'IN:SALE_RECEIPT');
  assert.equal(state.domains.STORE.records.SALE2.history.length, 1);
  assert.equal(state.domains.CALENDAR.records['Q-SALE2'].history.length, 1);
});

test('obligation workflow creates explicit installment queues without moving money', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildObligationWorkflow } = await import('../greenfield/business-workflows.mjs');
  const state = await apply(createGreenfieldState(), buildObligationWorkflow({ workflowId:'WF-OBL-1', obligationId:'OBL1', title:'ค่าซ่อม', totalSatang:90000, installments:[
    { queueId:'Q1', amountSatang:30000, dueDate:'2026-08-15' }, { queueId:'Q2', amountSatang:30000, dueDate:'2026-09-15' }, { queueId:'Q3', amountSatang:30000, dueDate:'2026-10-15' }
  ]}).commands);
  const obligation = state.domains.LEDGER.records.OBL1.record;
  assert.equal(obligation.remainingSatang, 90000);
  assert.equal(obligation.installmentCount, 3);
  assert.equal(Object.keys(state.domains.CALENDAR.records).length, 3);
  assert.equal(Object.values(state.domains.LEDGER.records).filter(e => e.record.type === 'TRANSACTION').length, 0);
});

test('obligation payment atomically updates obligation, creates Ledger OUT, and updates only the matching Calendar queue', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildObligationWorkflow, buildPayObligationWorkflow } = await import('../greenfield/business-workflows.mjs');
  let state = createGreenfieldState();
  state = await apply(state, buildObligationWorkflow({ workflowId:'WF-OBL-1', obligationId:'OBL1', title:'ภาระ', totalSatang:60000, installments:[
    { queueId:'Q1', amountSatang:30000, dueDate:'2026-08-15' }, { queueId:'Q2', amountSatang:30000, dueDate:'2026-09-15' }
  ]}).commands);
  state = await apply(state, buildPayObligationWorkflow({ workflowId:'WF-PAY-1', obligationId:'OBL1', queueId:'Q1', ledgerTransactionId:'TX-PAY1', amountSatang:30000 }).commands);
  assert.equal(state.domains.LEDGER.records.OBL1.record.remainingSatang, 30000);
  assert.equal(state.domains.LEDGER.records.OBL1.record.status, 'PARTIAL');
  assert.equal(state.domains.LEDGER.records['TX-PAY1'].record.detail, 'OUT:OBLIGATION_PAYMENT');
  assert.equal(state.domains.CALENDAR.records.Q1.record.status, 'COMPLETED');
  assert.equal(state.domains.CALENDAR.records.Q2.record.status, 'OPEN');
  assert.equal(state.domains.LEDGER.records.OBL1.history.length, 1);
});

test('obligation builder rejects installment totals that do not equal the obligation total', async () => {
  const { buildObligationWorkflow } = await import('../greenfield/business-workflows.mjs');
  assert.throws(() => buildObligationWorkflow({ workflowId:'WF-BAD', obligationId:'OBL', title:'bad', totalSatang:10000, installments:[{ queueId:'Q', amountSatang:9000, dueDate:'2026-08-15' }] }), /INSTALLMENT_TOTAL_MISMATCH/);
});