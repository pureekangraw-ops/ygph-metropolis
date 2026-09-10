"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function apply(commands) {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-12T11:20:00.000Z' });
  let state = createGreenfieldState();
  for (const command of commands) state = await runtime.execute(state, { ...command, expectedRevision: state.revision });
  return state;
}

test('purchase workflow creates Store purchase, Ledger OUT, and optional non-cash return window', async () => {
  const { buildPurchaseWorkflow } = await import('../greenfield/business-workflows.mjs');
  const state = await apply(buildPurchaseWorkflow({ workflowId:'WF-BUY', purchaseId:'BUY1', ledgerTransactionId:'TX-BUY1', returnQueueId:'Q-RET1', title:'รับสินค้าเข้า', amountSatang:50000, quantity:5, returnDueDate:'2026-08-19' }).commands);
  assert.equal(state.domains.STORE.records.BUY1.record.type, 'PURCHASE');
  assert.equal(state.domains.LEDGER.records['TX-BUY1'].record.detail, 'OUT:PURCHASE');
  assert.equal(state.domains.CALENDAR.records['Q-RET1'].record.type, 'PURCHASE_RETURN_WINDOW');
  assert.equal(state.domains.CALENDAR.records['Q-RET1'].record.amountSatang, 0);
});

test('stock withdrawal and stock adjustment are Store-only evidence', async () => {
  const { buildStockWithdrawalWorkflow, buildStockAdjustmentWorkflow } = await import('../greenfield/business-workflows.mjs');
  const state = await apply([
    ...buildStockWithdrawalWorkflow({ workflowId:'WF-WD', recordId:'WD1', title:'ตัวอย่างสินค้า', quantity:1 }).commands,
    ...buildStockAdjustmentWorkflow({ workflowId:'WF-ADJ', recordId:'ADJ1', title:'ปรับสต็อก 13 → 5', deltaQuantity:-8, reason:'STOCK_COUNT_MISMATCH' }).commands,
  ]);
  assert.equal(state.domains.STORE.records.WD1.record.type, 'STOCK_WITHDRAWAL');
  assert.equal(state.domains.STORE.records.ADJ1.record.quantity, -8);
  assert.equal(state.domains.STORE.records.ADJ1.record.reason, 'STOCK_COUNT_MISMATCH');
  assert.equal(Object.keys(state.domains.LEDGER.records).length, 0);
  assert.equal(Object.keys(state.domains.CALENDAR.records).length, 0);
});

test('other income and expense workflows are Ledger-only real cash movements', async () => {
  const { buildOtherIncomeWorkflow, buildExpenseWorkflow } = await import('../greenfield/business-workflows.mjs');
  const state = await apply([
    ...buildOtherIncomeWorkflow({ workflowId:'WF-IN', ledgerTransactionId:'TX-IN', title:'รายรับอื่น', amountSatang:7000 }).commands,
    ...buildExpenseWorkflow({ workflowId:'WF-OUT', ledgerTransactionId:'TX-OUT', title:'ค่าน้ำ', amountSatang:3000 }).commands,
  ]);
  assert.equal(state.domains.LEDGER.records['TX-IN'].record.detail, 'IN:OTHER_INCOME');
  assert.equal(state.domains.LEDGER.records['TX-OUT'].record.detail, 'OUT:EXPENSE');
  assert.equal(Object.keys(state.domains.STORE.records).length, 0);
  assert.equal(Object.keys(state.domains.CALENDAR.records).length, 0);
});

test('calendar close/cancel workflows never create Ledger transactions', async () => {
  const { buildCalendarStatusWorkflow } = await import('../greenfield/business-workflows.mjs');
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-12T11:20:00.000Z' });
  const state = createGreenfieldState();
  state.domains.CALENDAR.records.Q1 = { record:{recordId:'Q1',source:'CALENDAR',type:'PURCHASE_RETURN_WINDOW',title:'คืนสินค้า',amountSatang:0,status:'OPEN'}, provenance:{origin:'EVIDENCE_IMPORT'} };
  const plan = buildCalendarStatusWorkflow({ workflowId:'WF-CAL', queueId:'Q1', status:'COMPLETED' });
  let next=state;
  for (const command of plan.commands) next=await runtime.execute(next,{...command,expectedRevision:next.revision});
  assert.equal(next.domains.CALENDAR.records.Q1.record.status, 'COMPLETED');
  assert.equal(Object.keys(next.domains.LEDGER.records).length, 0);
});

test('create Product stock workflow creates one Product then linked opening stock atomically', async () => {
  const { buildCreateProductStockWorkflow } = await import('../greenfield/business-workflows.mjs');
  const plan = buildCreateProductStockWorkflow({
    workflowId:'WF-P1',
    productId:'P1',
    stockRecordId:'STOCK-P1-OPEN',
    name:'Samsung A55',
    model:'128GB',
    color:'ดำ',
    quantity:3,
  });

  assert.equal(plan.commands.length, 2);
  assert.equal(plan.commands[0].domain, 'STORE');
  assert.equal(plan.commands[0].type, 'STORE_CREATE_PRODUCT');
  assert.equal(plan.commands[0].payload.record.productId, 'P1');
  assert.equal(plan.commands[1].domain, 'STORE');
  assert.equal(plan.commands[1].type, 'STORE_CREATE_RECORD');
  assert.equal(plan.commands[1].payload.record.type, 'STOCK_ADJUSTMENT');
  assert.equal(plan.commands[1].payload.record.productId, 'P1');
  assert.equal(plan.commands[1].payload.record.quantity, 3);

  const state = await apply(plan.commands);
  assert.equal(state.domains.STORE.records.P1.record.type, 'PRODUCT');
  assert.equal(state.domains.STORE.records.P1.record.name, 'Samsung A55');
  assert.equal(state.domains.STORE.records['STOCK-P1-OPEN'].record.productId, 'P1');
});

test('restock workflow adds only a linked stock movement and does not create another Product', async () => {
  const { buildAddProductStockWorkflow } = await import('../greenfield/business-workflows.mjs');
  const plan = buildAddProductStockWorkflow({
    workflowId:'WF-P1-RESTOCK',
    productId:'P1',
    stockRecordId:'STOCK-P1-RESTOCK',
    title:'เติม Samsung A55',
    quantity:2,
  });

  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0].type, 'STORE_CREATE_RECORD');
  assert.equal(plan.commands[0].payload.record.type, 'STOCK_ADJUSTMENT');
  assert.equal(plan.commands[0].payload.record.productId, 'P1');
  assert.equal(plan.commands[0].payload.record.quantity, 2);
});

test('legacy Store workflow builders remain valid without productId', async () => {
  const { buildPurchaseWorkflow, buildStockWithdrawalWorkflow } = await import('../greenfield/business-workflows.mjs');
  const purchase = buildPurchaseWorkflow({
    workflowId:'WF-LEGACY-BUY', purchaseId:'BUY-LEGACY', ledgerTransactionId:'TX-LEGACY-BUY',
    title:'รับของเดิม', amountSatang:10000, quantity:2,
  });
  const withdrawal = buildStockWithdrawalWorkflow({
    workflowId:'WF-LEGACY-WD', recordId:'WD-LEGACY', title:'เบิกของเดิม', quantity:1,
  });

  assert.equal('productId' in purchase.commands[0].payload.record, false);
  assert.equal('productId' in withdrawal.commands[0].payload.record, false);
});
