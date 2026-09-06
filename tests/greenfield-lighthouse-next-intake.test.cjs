const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next/chat-intake.mjs')).href;

async function loadIntake() {
  return import(`${moduleUrl}?t=${Date.now()}`);
}

test('store shorthand without the word ขาย infers product, quantity, and sale operation', async () => {
  const { parseIncomeDetails, mergeIncomeDetails, deriveIncomeStage } = await loadIntake();
  const pending = {
    kind: 'INCOME', amount: 500, source: null, operation: null, product: null, quantity: null,
  };

  const merged = mergeIncomeDetails(pending, parseIncomeDetails('จากร้าน สบู่ 3 อัน'));

  assert.equal(merged.source, 'STORE');
  assert.equal(merged.operation, 'SALE');
  assert.equal(merged.product, 'สบู่');
  assert.equal(merged.quantity, 3);
  assert.equal(deriveIncomeStage(merged), 'CONFIRM_SALE');
});

test('partial shorthand asks only for the field that is still missing', async () => {
  const { parseIncomeDetails, mergeIncomeDetails, missingIncomeFields } = await loadIntake();
  const base = { kind: 'INCOME', amount: 500, source: null, operation: null, product: null, quantity: null };

  const productOnly = mergeIncomeDetails(base, parseIncomeDetails('จากร้าน สบู่'));
  assert.deepEqual(missingIncomeFields(productOnly), ['จำนวนกี่อัน']);

  const quantityOnly = mergeIncomeDetails(base, parseIncomeDetails('จากร้าน 3 อัน'));
  assert.deepEqual(missingIncomeFields(quantityOnly), ['ขายอะไร']);
});

test('complete store shorthand has no duplicate missing-field prompt', async () => {
  const { parseIncomeDetails, mergeIncomeDetails, missingIncomeFields } = await loadIntake();
  const base = { kind: 'INCOME', amount: 500, source: null, operation: null, product: null, quantity: null };
  const merged = mergeIncomeDetails(base, parseIncomeDetails('จากร้าน สบู่ 3 อัน'));

  assert.deepEqual(missingIncomeFields(merged), []);
});
