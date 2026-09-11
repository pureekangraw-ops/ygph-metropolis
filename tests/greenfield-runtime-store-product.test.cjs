"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

function evidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-STORE-PRODUCT',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-09-10T10:00:00.000Z', sourceRevision:1,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[
      {eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:0,calculation:{openingBalanceSatang:0}}},validation:{ownerConfirmation:'UNCONFIRMED'}}
    ]
  });
}

async function openedRuntime() {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const runtime = createGreenfieldRuntime({ store:createMemoryVaultStore(), passphrase:'correct horse battery staple', lockManager:null, now:()=>'2026-09-10T11:00:00.000Z' });
  await runtime.initializeFromEvidence(evidence(), { expectedPackageId:'FLOW-STORE-PRODUCT', expectedRevision:1 });
  return runtime;
}

test('runtime creates one Product with opening stock then restocks the same product', async () => {
  const runtime = await openedRuntime();
  await runtime.createProductStock({ workflowId:'WF-P1', productId:'P1', stockRecordId:'P1-OPEN', name:'Samsung A55', model:'128GB', color:'ดำ', quantity:3 });
  await runtime.addProductStock({ workflowId:'WF-P1-R', productId:'P1', stockRecordId:'P1-R', title:'เติม Samsung A55', quantity:2 });
  const state = await runtime.readState();
  const { projectStockTruth } = await import('../greenfield/calculation-authority.mjs');
  assert.equal(state.domains.STORE.records.P1.record.type, 'PRODUCT');
  assert.equal(Object.values(state.domains.STORE.records).filter(entry => entry.record?.type === 'PRODUCT').length, 1);
  assert.equal(projectStockTruth(state).byProductId.P1, 5);
});

test('legacy runtime sale remains compatible without productId', async () => {
  const runtime = await openedRuntime();
  await runtime.stockAdjustment({ workflowId:'WF-LEGACY-IN', recordId:'LEGACY-IN', title:'ของเดิม', deltaQuantity:1, reason:'OPENING' });
  const result = await runtime.sale({ workflowId:'WF-LEGACY-S', saleId:'SALE-LEGACY', ledgerTransactionId:'TX-LEGACY', title:'ขายเดิม', amountSatang:10000, quantity:1, receivedSatang:10000 });
  assert.equal(result.status, 'VERIFIED');
  assert.equal((await runtime.readState()).domains.STORE.records['SALE-LEGACY'].record.productId, undefined);
});

test('LIGHTHOUSE Store bridge reads exact durable product stock and verifies a paid sale', async () => {
  const { createLighthouseStoreBridge } = await import('../lighthouse-next/runtime-store.mjs');
  const runtime = await openedRuntime();
  await runtime.createProductStock({ workflowId:'WF-P1', productId:'P1', stockRecordId:'P1-OPEN', name:'Samsung A55', model:'128GB', color:'ดำ', quantity:5 });
  const bridge = createLighthouseStoreBridge({ withSession: async callback => callback(runtime) });
  const before = await bridge.readStoreTruth();
  assert.equal(before.products[0].productId, 'P1');
  assert.equal(before.products[0].quantity, 5);
  const sale = await bridge.sellProduct({ workflowId:'WF-S1', saleId:'SALE-S1', ledgerTransactionId:'TX-S1', productId:'P1', productName:'Samsung A55', quantity:2, totalBaht:11800 });
  assert.equal(sale.status, 'VERIFIED');
  assert.equal(sale.postStock, 3);
  const state = await runtime.readState();
  assert.equal(state.domains.STORE.records['SALE-S1'].record.productId, 'P1');
  assert.equal(state.domains.LEDGER.records['TX-S1'].record.sourceRef, 'STORE/SALE-S1');
});
