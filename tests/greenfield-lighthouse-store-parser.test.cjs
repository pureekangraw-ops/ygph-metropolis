"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const products = [
  { productId:'P-BLACK', name:'Samsung A55', model:'128GB', color:'ดำ', quantity:3 },
  { productId:'P-WHITE', name:'Samsung A55', model:'128GB', color:'ขาว', quantity:2 },
  { productId:'P-WATER', name:'น้ำ', quantity:12 },
];

test('product add parser keeps only supplied identity and quantity without inventing model or color', async () => {
  const { parseProductAddText } = await import('../lighthouse-next/store-product.mjs');
  assert.deepEqual(parseProductAddText('เพิ่มน้ำ 6 ขวด'), { name:'น้ำ', quantity:6 });
  assert.deepEqual(parseProductAddText('เพิ่ม Samsung A55 128GB ดำ 3 เครื่อง'), {
    name:'Samsung A55', model:'128GB', color:'ดำ', quantity:3,
  });
});

test('product question suggestion asks for model on broad phone cue but never supplies a value', async () => {
  const { suggestProductQuestion } = await import('../lighthouse-next/store-product.mjs');
  assert.deepEqual(suggestProductQuestion({ name:'มือถือ' }, products), { field:'model', prompt:'รุ่นไหนครับ?' });
  assert.equal(suggestProductQuestion({ name:'น้ำ', quantity:6 }, products), null);
});

test('product draft resolver returns exact existing product or ambiguity instead of silently merging variants', async () => {
  const { resolveProductDraft } = await import('../lighthouse-next/store-product.mjs');
  assert.deepEqual(resolveProductDraft({ name:'Samsung A55', model:'128GB' }, products), {
    status:'AMBIGUOUS', candidates:['P-BLACK','P-WHITE'], missingField:'color',
  });
  assert.deepEqual(resolveProductDraft({ name:'Samsung A55', model:'128GB', color:'ดำ' }, products), {
    status:'EXACT', productId:'P-BLACK',
  });
  assert.deepEqual(resolveProductDraft({ name:'น้ำ' }, products), { status:'EXACT', productId:'P-WATER' });
});

test('sale parser resolves durable productId and explicit unit versus total price', async () => {
  const { parseStoreSale } = await import('../lighthouse-next/store-sale.mjs');
  assert.deepEqual(parseStoreSale('ขาย Samsung A55 128GB ดำ 2 เครื่อง ชิ้นละ 5900', products), {
    productId:'P-BLACK', productName:'Samsung A55', quantity:2, priceBaht:5900, priceBasis:'UNIT',
  });
  assert.deepEqual(parseStoreSale('ขาย Samsung A55 128GB ดำ 2 เครื่อง รวม 11800', products), {
    productId:'P-BLACK', productName:'Samsung A55', quantity:2, priceBaht:11800, priceBasis:'TOTAL',
  });
});

test('sale parser refuses ambiguous product and ambiguous multi-quantity bare price', async () => {
  const { parseStoreSale } = await import('../lighthouse-next/store-sale.mjs');
  const productAmbiguous = parseStoreSale('ขาย Samsung A55 2 เครื่อง ชิ้นละ 5900', products);
  assert.equal(productAmbiguous.ambiguous, true);
  assert.deepEqual(productAmbiguous.candidates.map(item => item.productId), ['P-BLACK','P-WHITE']);

  assert.deepEqual(parseStoreSale('ขาย Samsung A55 128GB ดำ 2 เครื่อง 5900', products), {
    productId:'P-BLACK', productName:'Samsung A55', quantity:2, priceBaht:5900, priceBasis:null,
  });
  assert.deepEqual(parseStoreSale('ขายน้ำ 1 ขวด 20', products), {
    productId:'P-WATER', productName:'น้ำ', quantity:1, priceBaht:20, priceBasis:'UNIT',
  });
});
