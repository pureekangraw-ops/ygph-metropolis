const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next/chat-intent-recovery.mjs')).href;

async function loadRecovery() {
  return import(`${moduleUrl}?t=${Date.now()}`);
}

test('recovery fills only the missing general-income source and preserves amount', async () => {
  const { recoverIntentSlot } = await loadRecovery();
  const pending = {
    kind:'GENERAL_INCOME',
    status:'INCOMPLETE',
    slots:{ amount:500, source:null },
    missing:['source'],
    ambiguous:[],
  };
  assert.deepEqual(recoverIntentSlot(pending, 'งานฟรีแลนซ์'), {
    kind:'GENERAL_INCOME',
    status:'READY',
    slots:{ amount:500, source:'งานฟรีแลนซ์' },
    missing:[],
    ambiguous:[],
  });
});

test('recovery fills only store sale quantity and preserves product and price', async () => {
  const { recoverIntentSlot } = await loadRecovery();
  const pending = {
    kind:'STORE_SALE',
    status:'INCOMPLETE',
    slots:{ productId:'p1', productName:'มือถือ', quantity:null, priceBaht:566, priceBasis:null },
    missing:['quantity'],
    ambiguous:[],
  };
  assert.deepEqual(recoverIntentSlot(pending, '2 ชิ้น'), {
    kind:'STORE_SALE',
    status:'INCOMPLETE',
    slots:{ productId:'p1', productName:'มือถือ', quantity:2, priceBaht:566, priceBasis:null },
    missing:['priceBasis'],
    ambiguous:[],
  });
});

test('recovery fills only store sale price and preserves product and quantity', async () => {
  const { recoverIntentSlot } = await loadRecovery();
  const pending = {
    kind:'STORE_SALE',
    status:'INCOMPLETE',
    slots:{ productId:'p1', productName:'มือถือ', quantity:1, priceBaht:null, priceBasis:null },
    missing:['priceBaht'],
    ambiguous:[],
  };
  assert.deepEqual(recoverIntentSlot(pending, '566 บาท'), {
    kind:'STORE_SALE',
    status:'READY',
    slots:{ productId:'p1', productName:'มือถือ', quantity:1, priceBaht:566, priceBasis:'UNIT' },
    missing:[],
    ambiguous:[],
  });
});

test('recovery fills only store sale price basis and preserves resolved product quantity and price', async () => {
  const { recoverIntentSlot } = await loadRecovery();
  const pending = {
    kind:'STORE_SALE',
    status:'INCOMPLETE',
    slots:{ productId:'p1', productName:'มือถือ', quantity:2, priceBaht:566, priceBasis:null },
    missing:['priceBasis'],
    ambiguous:[],
  };
  assert.deepEqual(recoverIntentSlot(pending, 'ต่อชิ้น'), {
    kind:'STORE_SALE',
    status:'READY',
    slots:{ productId:'p1', productName:'มือถือ', quantity:2, priceBaht:566, priceBasis:'UNIT' },
    missing:[],
    ambiguous:[],
  });
});

test('recovery resolves only an ambiguous product candidate and keeps other slots untouched', async () => {
  const { recoverIntentSlot } = await loadRecovery();
  const pending = {
    kind:'STORE_SALE',
    status:'INCOMPLETE',
    slots:{ productId:null, productName:null, quantity:2, priceBaht:566, priceBasis:null },
    missing:[],
    ambiguous:[{ slot:'product', candidates:[
      { productId:'p1', productName:'มือถือ A' },
      { productId:'p2', productName:'มือถือ B' },
    ] }],
  };
  assert.deepEqual(recoverIntentSlot(pending, 'มือถือ B'), {
    kind:'STORE_SALE',
    status:'INCOMPLETE',
    slots:{ productId:'p2', productName:'มือถือ B', quantity:2, priceBaht:566, priceBasis:null },
    missing:['priceBasis'],
    ambiguous:[],
  });
});

test('recovery refuses unrelated answers instead of reparsing or overwriting known slots', async () => {
  const { recoverIntentSlot } = await loadRecovery();
  const pending = {
    kind:'STORE_SALE',
    status:'INCOMPLETE',
    slots:{ productId:'p1', productName:'มือถือ', quantity:2, priceBaht:566, priceBasis:null },
    missing:['priceBasis'],
    ambiguous:[],
  };
  assert.deepEqual(recoverIntentSlot(pending, 'เมื่อวาน'), pending);
});
