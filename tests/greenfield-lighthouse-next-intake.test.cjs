const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next/general-income.mjs')).href;

async function loadIncomeParser() {
  return import(`${moduleUrl}?t=${Date.now()}`);
}

test('general income is amount plus human-language source with no forced route category', async () => {
  const { parseGeneralIncome } = await loadIncomeParser();

  assert.deepEqual(parseGeneralIncome('ทิป 59'), { amount: 59, source: 'ทิป' });
  assert.deepEqual(parseGeneralIncome('ขายมือถือ 566'), { amount: 566, source: 'ขายมือถือ' });
  assert.deepEqual(Object.keys(parseGeneralIncome('ทิป 59')).sort(), ['amount', 'source']);
});

test('general income can keep only the missing source pending', async () => {
  const { parseGeneralIncome } = await loadIncomeParser();

  assert.deepEqual(parseGeneralIncome('วันนี้ได้ 500'), { amount: 500, source: null });
  assert.deepEqual(parseGeneralIncome('ได้เงิน 300 จากเพื่อน'), { amount: 300, source: 'เพื่อน' });
});

test('tip remains ordinary income source text instead of becoming a ride-specific branch', async () => {
  const { parseGeneralIncome } = await loadIncomeParser();
  const parsed = parseGeneralIncome('ทิป 59');

  assert.equal(parsed.source, 'ทิป');
  assert.equal('route' in parsed, false);
  assert.equal('category' in parsed, false);
  assert.equal('owner' in parsed, false);
});
