"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function parse(value) {
  const { parseNumericText } = await import('../lighthouse/intent-number.mjs');
  return parseNumericText(value);
}

test('P1.2 parses Arabic digits into exact satang', async () => {
  assert.deepEqual(await parse('65'), { state:'RESOLVED', kind:'NUMBER', value:65, amountSatang:6500 });
});

test('P1.2 parses Thai digits with two decimals exactly', async () => {
  assert.deepEqual(await parse('๖๕.๕๐'), { state:'RESOLVED', kind:'NUMBER', value:65.5, amountSatang:6550 });
});

test('P1.2 accepts valid thousands commas', async () => {
  assert.deepEqual(await parse('1,500'), { state:'RESOLVED', kind:'NUMBER', value:1500, amountSatang:150000 });
});

test('P1.2 decodes the Thai number words required by Phase 1', async () => {
  assert.deepEqual(await parse('หกสิบห้า'), { state:'RESOLVED', kind:'THAI_WORD_NUMBER', value:65, amountSatang:6500 });
});

test('P1.2 rejects malformed grouping without coercion', async () => {
  assert.deepEqual(await parse('1,50'), { state:'INVALID', kind:'NUMBER', value:null, amountSatang:null });
});

test('P1.2 rejects money precision beyond two decimals without rounding', async () => {
  assert.deepEqual(await parse('65.555'), { state:'INVALID', kind:'MONEY_PRECISION', value:null, amountSatang:null });
});

test('P1.2 rejects non-positive values', async () => {
  assert.equal((await parse('0')).state, 'INVALID');
  assert.equal((await parse('-5')).state, 'INVALID');
});
