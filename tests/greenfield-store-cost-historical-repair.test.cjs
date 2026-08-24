"use strict";
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('historical Store sale cost repair adds only the missing linked Ledger OUT', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');

  const store = createMemoryVaultStore();
  const passphrase = 'correct horse battery staple';
  const initial = createGreenfieldState({ now:'2026-08-23T17:00:00.000Z' });
  await commitEncryptedState({ store, passphrase, state:initial, expectedDurableRevision:null });

  const runtime = createGreenfieldRuntime({ store, passphrase, lockManager:null, now:() => '2026-08-23T17:01:00.000Z' });
  await runtime.stockAdjustment({
    workflowId:'WF-SEED-STOCK',
    recordId:'ADJ-SEED-STOCK',
    title:'ตั้งต้นสต็อกทดสอบ',
    deltaQuantity:1,
    reason:'test fixture',
  });
  await runtime.sale({
    workflowId:'WF-LEGACY-SALE',
    saleId:'SALE-LEGACY-COST',
    ledgerTransactionId:'TX-LEGACY-SALE-IN',
    title:'ขายสินค้า',
    amountSatang:120000,
    quantity:1,
    receivedSatang:120000,
    storeCostSatang:0,
  });

  const legacy = await runtime.readState();
  legacy.domains.STORE.records['SALE-LEGACY-COST'].record.storeCostSatang = 32500;
  legacy.domains.STORE.records['SALE-LEGACY-COST'].record.netIncomeSatang = 87500;
  legacy.revision += 1;
  legacy.updatedAt = '2026-08-23T17:02:00.000Z';
  await commitEncryptedState({ store, passphrase, state:legacy, expectedDurableRevision:legacy.revision - 1 });
  await runtime.readState();

  const storeBefore = structuredClone(legacy.domains.STORE);
  const calendarBefore = structuredClone(legacy.domains.CALENDAR);
  assert.equal(runtime.project().ledgerBalanceSatang, 120000);

  const result = await runtime.repairStoreSaleCost({ saleId:'SALE-LEGACY-COST' });
  const durable = await runtime.readState();
  const expense = Object.values(durable.domains.LEDGER.records)
    .map(entry => entry.record)
    .find(record => record.direction === 'OUT' && record.sourceRef === 'STORE/SALE-LEGACY-COST' && record.detail === 'OUT:STORE_SALE_COST');

  assert.equal(result.status, 'VERIFIED');
  assert.equal(expense.amountSatang, 32500);
  assert.equal(expense.recordId, 'TX-STORE-COST/SALE-LEGACY-COST');
  assert.equal(runtime.project().ledgerBalanceSatang, 87500);
  assert.deepEqual(durable.domains.STORE, storeBefore);
  assert.deepEqual(durable.domains.CALENDAR, calendarBefore);

  const ledgerCount = Object.keys(durable.domains.LEDGER.records).length;
  const duplicate = await runtime.repairStoreSaleCost({ saleId:'SALE-LEGACY-COST' });
  const afterDuplicate = await runtime.readState();
  assert.equal(duplicate.status, 'ALREADY_REPAIRED');
  assert.equal(Object.keys(afterDuplicate.domains.LEDGER.records).length, ledgerCount);
  assert.equal(runtime.project().ledgerBalanceSatang, 87500);
  runtime.close();
});

test('Store history exposes an explicit confirmed action for a missing historical cash cost', () => {
  const storeUi = fs.readFileSync('ui/store-ui.mjs', 'utf8');
  const rootApp = fs.readFileSync('app.mjs', 'utf8');
  assert.match(storeUi, /เติมเงินออกที่ขาด/);
  assert.match(storeUi, /ygph:repair-store-cost/);
  assert.match(storeUi, /STORE_SALE_COST/);
  assert.match(rootApp, /repairStoreSaleCost/);
  assert.match(rootApp, /ไม่แก้ยอดขายหรือสต็อก/);
  assert.match(rootApp, /confirm\(/);
});

test('historical Store cash repair stays available after its old release note is retired', () => {
  const storeUi = fs.readFileSync('ui/store-ui.mjs', 'utf8');
  const status = fs.readFileSync('ui/release-status.mjs', 'utf8');
  assert.match(storeUi, /เติมเงินออกที่ขาด/);
  assert.doesNotMatch(status, /24 ส\.ค\. 2026 · 02:28/);
  assert.doesNotMatch(status, /รายการขายเก่า/);
});
