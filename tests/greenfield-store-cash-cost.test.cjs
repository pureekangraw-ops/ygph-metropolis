"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function commandRuntime() {
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const rt = createCommandRuntime();
  registerGreenfieldDomainCommands(rt, { now: () => '2026-08-23T14:00:00.000Z' });
  return rt;
}

async function apply(state, commands) {
  const rt = await commandRuntime();
  let next = state;
  for (const command of commands) next = await rt.execute(next, { ...command, expectedRevision: next.revision });
  return next;
}

test('sale cost paid by the store creates Ledger OUT so 1200 received minus 325 cost leaves 875 cash', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildSaleWorkflow } = await import('../greenfield/business-workflows.mjs');
  const { projectLedgerBalance } = await import('../greenfield/projections.mjs');

  const plan = buildSaleWorkflow({
    workflowId:'WF-SALE-GRAB',
    saleId:'SALE-GRAB',
    ledgerTransactionId:'TX-SALE-GRAB',
    title:'ขายสินค้า',
    amountSatang:120000,
    quantity:1,
    receivedSatang:120000,
    storeCostSatang:32500,
  });

  const state = await apply(createGreenfieldState(), plan.commands);
  const sale = state.domains.STORE.records['SALE-GRAB'].record;
  const ledger = Object.values(state.domains.LEDGER.records).map(entry => entry.record);
  const income = ledger.find(record => record.direction === 'IN' && record.sourceRef === 'STORE/SALE-GRAB');
  const expense = ledger.find(record => record.direction === 'OUT' && record.sourceRef === 'STORE/SALE-GRAB');

  assert.equal(sale.storeCostSatang, 32500);
  assert.equal(sale.netIncomeSatang, 87500);
  assert.equal(income?.amountSatang, 120000);
  assert.equal(expense?.amountSatang, 32500);
  assert.equal(projectLedgerBalance(state), 87500);
  assert.deepEqual(Object.keys(state.domains.CALENDAR.records), []);
});
