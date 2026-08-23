"use strict";
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('store sale cost field says it is real paid cash and does not suggest depreciation', () => {
  const app = fs.readFileSync('ui/app.mjs', 'utf8');
  assert.match(app, /ต้นทุนร้านค้า — จ่ายจริง \(บาท\)/);
  assert.match(app, /ค่าส่ง \/ Grab \/ น้ำมัน \/ แพ็กเกจ/);
  assert.doesNotMatch(app, /ค่าเสื่อม/);
});

test('runtime sale durably reads back linked Store cost OUT and 1200 - 325 cash balance', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');

  const store = createMemoryVaultStore();
  const passphrase = 'correct horse battery staple';
  const initial = createGreenfieldState({ now:'2026-08-23T14:30:00.000Z' });
  await commitEncryptedState({ store, passphrase, state:initial, expectedDurableRevision:null });

  const runtime = createGreenfieldRuntime({ store, passphrase, lockManager:null, now:() => '2026-08-23T14:31:00.000Z' });
  const result = await runtime.sale({
    workflowId:'WF-DURABLE-SALE-COST',
    saleId:'SALE-DURABLE-COST',
    ledgerTransactionId:'TX-DURABLE-SALE-IN',
    title:'ขายสินค้า',
    amountSatang:120000,
    quantity:1,
    receivedSatang:120000,
    storeCostSatang:32500,
  });

  const durable = await runtime.readState();
  const sale = durable.domains.STORE.records['SALE-DURABLE-COST']?.record;
  const ledger = Object.values(durable.domains.LEDGER.records).map(entry => entry.record);
  const income = ledger.find(record => record.direction === 'IN' && record.sourceRef === 'STORE/SALE-DURABLE-COST');
  const expense = ledger.find(record => record.direction === 'OUT' && record.sourceRef === 'STORE/SALE-DURABLE-COST');

  assert.equal(result.state.revision, durable.revision);
  assert.equal(sale.storeCostSatang, 32500);
  assert.equal(sale.netIncomeSatang, 87500);
  assert.equal(income.amountSatang, 120000);
  assert.equal(expense.amountSatang, 32500);
  assert.equal(expense.detail, 'OUT:STORE_SALE_COST');
  assert.equal(runtime.project().ledgerBalanceSatang, 87500);
  assert.deepEqual(Object.keys(durable.domains.CALENDAR.records), []);
  runtime.close();
});
