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
