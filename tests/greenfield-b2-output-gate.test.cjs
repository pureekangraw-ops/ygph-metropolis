const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');

const load = path => import(pathToFileURL(resolve(path)).href);

test('Output Gate translates EXPENSE to canonical OUTCOME App Language', async () => {
  const { translateIntentToAppLanguage } = await load('foundation/output-gate.mjs');
  const result = translateIntentToAppLanguage({
    version:'1', status:'READY', action:'CREATE', object:'EXPENSE',
    fields:{ title:'ข้าว', amountSatang:6500, paymentMode:null, note:null },
  });
  assert.deepEqual(result, {
    version:'1', action:'CREATE', target:'OUTCOME',
    fields:{ title:'ข้าว', amountSatang:6500 },
  });
});

test('Output Gate translates OTHER_INCOME to canonical INCOME App Language', async () => {
  const { translateIntentToAppLanguage } = await load('foundation/output-gate.mjs');
  const result = translateIntentToAppLanguage({
    version:'1', status:'READY', action:'CREATE', object:'OTHER_INCOME',
    fields:{ title:'เงินคืน', amountSatang:50000, paymentMode:null, note:null },
  });
  assert.equal(result.target, 'INCOME');
  assert.equal(result.fields.amountSatang, 50000);
});

test('Output Gate stops instead of guessing unsupported meaning', async () => {
  const { translateIntentToAppLanguage } = await load('foundation/output-gate.mjs');
  assert.throws(() => translateIntentToAppLanguage({
    version:'1', status:'READY', action:'CREATE', object:'SALE',
    fields:{ title:'ขาย', amountSatang:80000, paymentMode:null, note:null },
  }), /OUTPUT_GATE_UNSUPPORTED_OBJECT:SALE/);
});
