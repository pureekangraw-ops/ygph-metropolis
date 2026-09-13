const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next/chat-intent.mjs')).href;

async function loadIntent() {
  return import(`${moduleUrl}?t=${Date.now()}`);
}

test('CHAT intent preserves known slots and reports only the missing slot', async () => {
  const { interpretChatIntent } = await loadIntent();
  assert.deepEqual(
    interpretChatIntent('ได้เงิน 500', { storeProducts: [] }),
    {
      kind: 'GENERAL_INCOME',
      status: 'INCOMPLETE',
      slots: { amount: 500, source: null },
      missing: ['source'],
      ambiguous: [],
    },
  );
});

test('CHAT intent keeps a resolved store sale separate from general income', async () => {
  const { interpretChatIntent } = await loadIntent();
  const storeProducts = [{ productId: 'p1', name: 'มือถือ', model: null, color: null, descriptors: [] }];
  assert.deepEqual(
    interpretChatIntent('ขายมือถือ 566 2 ชิ้น', { storeProducts }),
    {
      kind: 'STORE_SALE',
      status: 'INCOMPLETE',
      slots: {
        productId: 'p1',
        productName: 'มือถือ',
        quantity: 2,
        priceBaht: 566,
        priceBasis: null,
      },
      missing: ['priceBasis'],
      ambiguous: [],
    },
  );
});

test('CHAT intent never invents a domain for ambiguous income language', async () => {
  const { interpretChatIntent } = await loadIntent();
  const result = interpretChatIntent('รับเงิน 500', { storeProducts: [] });
  assert.equal(result.kind, 'GENERAL_INCOME');
  assert.equal(result.slots.amount, 500);
  assert.equal(result.slots.source, 'รับเงิน');
  assert.deepEqual(result.ambiguous, []);
  assert.equal('route' in result, false);
  assert.equal('owner' in result, false);
});

test('unknown sale stays unknown instead of being reclassified as general income', async () => {
  const { interpretChatIntent } = await loadIntent();
  assert.equal(
    interpretChatIntent('ขายของที่ไม่มีในร้าน 566', { storeProducts: [] }),
    null,
  );
});
