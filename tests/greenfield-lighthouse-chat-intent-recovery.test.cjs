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
