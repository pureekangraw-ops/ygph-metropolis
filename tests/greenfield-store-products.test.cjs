"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function stateWithProducts(products) {
  return {
    schema:2,
    revision:1,
    domains:{
      STORE:{records:Object.fromEntries(products.map(product => [product.recordId, { record:product }]))},
      LEDGER:{records:{}},
      CALENDAR:{records:{}},
      RIDE:{records:{}},
    },
  };
}

test('missing optional Product fields stay absent', async () => {
  const { normalizeProductIdentity } = await import('../greenfield/store-products.mjs');
  assert.deepEqual(
    normalizeProductIdentity({ name:'ฟิล์มกันรอย', model:'ไม่มี', color:'', descriptors:['', 'ไม่มี'] }),
    { name:'ฟิล์มกันรอย' },
  );
});

test('candidate matching never silently merges variants when query omits the differing field', async () => {
  const { findProductCandidates } = await import('../greenfield/store-products.mjs');
  const state = stateWithProducts([
    {recordId:'P-A',productId:'P-A',type:'PRODUCT',source:'STORE',name:'Samsung A55',color:'ดำ',status:'ACTIVE'},
    {recordId:'P-B',productId:'P-B',type:'PRODUCT',source:'STORE',name:'Samsung A55',color:'ฟ้า',status:'ACTIVE'},
  ]);

  assert.deepEqual(
    findProductCandidates(state, { name:'Samsung A55' }).map(product => product.productId),
    ['P-A','P-B'],
  );
  assert.deepEqual(
    findProductCandidates(state, { name:'Samsung A55', color:'ดำ' }).map(product => product.productId),
    ['P-A'],
  );
});

test('Product normalization trims whitespace and deduplicates supplied descriptors without inventing values', async () => {
  const { normalizeProductIdentity } = await import('../greenfield/store-products.mjs');
  assert.deepEqual(
    normalizeProductIdentity({
      name:'  Samsung   A55 ',
      model:' 128GB ',
      color:' ดำ ',
      descriptors:[' 5G ', '5G', ' Dual SIM '],
    }),
    { name:'Samsung A55', model:'128GB', color:'ดำ', descriptors:['5G','Dual SIM'] },
  );
});

test('stock truth keeps legacy aggregate while projecting exact quantity per productId', async () => {
  const { projectStockTruth } = await import('../greenfield/calculation-authority.mjs');
  const state = stateWithProducts([
    {recordId:'P1',productId:'P1',type:'PRODUCT',source:'STORE',name:'Samsung A55',status:'ACTIVE'},
    {recordId:'P1-IN',type:'STOCK_ADJUSTMENT',title:'เพิ่ม A55',amountSatang:null,quantity:5,productId:'P1',status:'COMPLETED'},
    {recordId:'P1-SALE',type:'SALE',title:'ขาย A55',amountSatang:1180000,quantity:2,productId:'P1',status:'COMPLETED'},
    {recordId:'LEGACY-IN',type:'STOCK_ADJUSTMENT',title:'สต็อกเดิม',amountSatang:null,quantity:7,status:'COMPLETED'},
  ]);
  assert.deepEqual(projectStockTruth(state), {
    stockQuantity:10,
    legacyUnassignedQuantity:7,
    byProductId:{ P1:3 },
  });
});

test('product stock underflow is rejected even when legacy aggregate stock would mask it', async () => {
  const { validateWorkflowInvariants } = await import('../greenfield/workflow-invariants.mjs');
  const state = stateWithProducts([
    {recordId:'P1',productId:'P1',type:'PRODUCT',source:'STORE',name:'Samsung A55',status:'ACTIVE'},
    {recordId:'P1-IN',type:'STOCK_ADJUSTMENT',title:'เพิ่ม A55',amountSatang:null,quantity:1,productId:'P1',status:'COMPLETED'},
    {recordId:'LEGACY-IN',type:'STOCK_ADJUSTMENT',title:'สต็อกเดิม',amountSatang:null,quantity:100,status:'COMPLETED'},
  ]);
  const commands = [{
    commandId:'SALE-P1', idempotencyKey:'SALE:P1', domain:'STORE', type:'STORE_CREATE_RECORD',
    payload:{record:{recordId:'SALE-P1',type:'SALE',title:'ขาย A55',amountSatang:10000,quantity:2,productId:'P1',status:'COMPLETED'}},
  }];
  assert.throws(() => validateWorkflowInvariants(state, commands), /STORE_PRODUCT_STOCK_UNDERFLOW:P1\/-1/);
});

test('same workflow may create a Product and its positive opening stock', async () => {
  const { validateWorkflowInvariants } = await import('../greenfield/workflow-invariants.mjs');
  const state = stateWithProducts([]);
  const commands = [
    {commandId:'P2',idempotencyKey:'P2',domain:'STORE',type:'STORE_CREATE_PRODUCT',payload:{record:{recordId:'P2',productId:'P2',name:'น้ำ'}}},
    {commandId:'P2-IN',idempotencyKey:'P2-IN',domain:'STORE',type:'STORE_CREATE_RECORD',payload:{record:{recordId:'P2-IN',type:'STOCK_ADJUSTMENT',title:'เพิ่มน้ำ',amountSatang:null,quantity:3,productId:'P2',status:'COMPLETED'}}},
  ];
  assert.deepEqual(validateWorkflowInvariants(state, commands), {status:'PASS'});
});

test('linked stock movement cannot reference an unknown Product', async () => {
  const { validateWorkflowInvariants } = await import('../greenfield/workflow-invariants.mjs');
  const state = stateWithProducts([]);
  const commands = [{
    commandId:'UNKNOWN-IN', idempotencyKey:'UNKNOWN-IN', domain:'STORE', type:'STORE_CREATE_RECORD',
    payload:{record:{recordId:'UNKNOWN-IN',type:'STOCK_ADJUSTMENT',title:'เพิ่มของ',amountSatang:null,quantity:1,productId:'P404',status:'COMPLETED'}},
  }];
  assert.throws(() => validateWorkflowInvariants(state, commands), /STORE_PRODUCT_NOT_FOUND:P404/);
});

test('reconciliation reports durable negative stock for the exact productId even when aggregate stays positive', async () => {
  const { reconcileSystemState } = await import('../greenfield/system-reconciliation.mjs');
  const state = stateWithProducts([
    {recordId:'P1',productId:'P1',type:'PRODUCT',source:'STORE',name:'Samsung A55',status:'ACTIVE'},
    {recordId:'P1-IN',type:'STOCK_ADJUSTMENT',title:'เพิ่ม A55',amountSatang:null,quantity:1,productId:'P1',status:'COMPLETED'},
    {recordId:'P1-SALE',type:'SALE',title:'ขาย A55',amountSatang:10000,quantity:2,productId:'P1',status:'COMPLETED'},
    {recordId:'LEGACY-IN',type:'STOCK_ADJUSTMENT',title:'สต็อกเดิม',amountSatang:null,quantity:100,status:'COMPLETED'},
  ]);
  const result = reconcileSystemState(state,{ledgerBalanceSatang:0,today:'2026-09-10'});
  assert.equal(result.status,'FAIL');
  assert.deepEqual(
    result.errors.find(item => item.code === 'STORE_PRODUCT_STOCK_UNDERFLOW'),
    {code:'STORE_PRODUCT_STOCK_UNDERFLOW',productId:'P1',value:-1},
  );
});
