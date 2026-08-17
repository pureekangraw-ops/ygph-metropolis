"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ui/app.mjs'), 'utf8');

function source(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('Home Store and Finance rendering are isolated behind focused city modules', () => {
  const home = source('ui/home-ui.mjs');
  const store = source('ui/store-ui.mjs');
  const finance = source('ui/finance-ui.mjs');

  assert.match(home, /export function createHomeUi\(/);
  assert.match(store, /export function createStoreUi\(/);
  assert.match(finance, /export function createFinanceUi\(/);

  assert.match(app, /import \{ createHomeUi \} from ['"]\.\/home-ui\.mjs['"]/);
  assert.match(app, /import \{ createStoreUi \} from ['"]\.\/store-ui\.mjs['"]/);
  assert.match(app, /import \{ createFinanceUi \} from ['"]\.\/finance-ui\.mjs['"]/);

  assert.doesNotMatch(app, /function renderHome\(/);
  assert.doesNotMatch(app, /function renderStore\(/);
  assert.doesNotMatch(app, /function renderFinance\(/);
  assert.match(app, /homeUi\.renderHome\(context\)/);
  assert.match(app, /storeUi\.renderStore\(context\)/);
  assert.match(app, /financeUi\.renderFinance\(context\)/);
});
