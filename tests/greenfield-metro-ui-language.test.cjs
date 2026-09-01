"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = path => readFile(join(root, path), 'utf8');

test('METRO UI language uses one List -> Detail -> Action grammar across MANUAL houses', async () => {
  const ui = await read('ui/manual-finance-ui.mjs');
  assert.match(ui, /recordRow/);
  assert.match(ui, /recordDetail/);
  assert.match(ui, /primaryAction/);
  assert.match(ui, /secondaryActions/);
  assert.match(ui, /manualActionSheet/);
  assert.match(ui, /showManualActionSheet/);
});

test('ordinary records are tappable list rows while cards are reserved for target and ceiling story blocks', async () => {
  const ui = await read('ui/manual-finance-ui.mjs');
  assert.match(ui, /manual-list-row/);
  assert.match(ui, /manual-story-card/);
  assert.doesNotMatch(ui, /for\s*\(const record of receivables\)[\s\S]{0,900}item-actions/, 'receivable list must not expose payment controls inline on every row');
});

test('short MANUAL actions use a bottom sheet and forms use progressive disclosure', async () => {
  const ui = await read('ui/manual-finance-ui.mjs');
  const css = await read('ui/manual-finance.css');
  assert.match(ui, /manual-action-sheet/);
  assert.match(ui, /รายละเอียดเพิ่มเติม/);
  assert.match(ui, /node\(documentRef, ['"]details['"]/);
  assert.match(css, /manual-action-sheet/);
  assert.match(css, /manual-list-row/);
  assert.match(css, /min-height:\s*44px|min-block-size:\s*44px/);
});

test('durable actions render refreshed truth only through existing mutation/readback callback', async () => {
  const ui = await read('ui/manual-finance-ui.mjs');
  assert.match(ui, /await task\(\);\s*await onChanged\(copy\)/);
  assert.doesNotMatch(ui, /success[^\n]*before|optimisticSuccess/i);
});
