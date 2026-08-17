"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Store exposes truth-first overview and inspection routes without per-product claims', () => {
  const html = read('index.html');
  assert.match(html, /data-store-view="overview"/);
  assert.match(html, /data-store-view="receivables"/);
  assert.match(html, /data-store-view="stock-movements"/);
  assert.match(html, /data-store-view="history"/);
  assert.doesNotMatch(html, /SKU|productId|สต็อกรายสินค้า/);
});

test('Store keeps short actions in popup layer', () => {
  const popup = read('ui/action-popups.mjs');
  for (const task of ['sale','purchase','withdraw','adjust']) assert.match(popup, new RegExp(`'${task}'`));
});

test('Store UI renders receivable relation states without guessing duplicate queues', () => {
  const storeUi = read('ui/store-ui.mjs');
  const app = read('ui/app.mjs');
  assert.match(storeUi, /projectStoreReceivables/);
  assert.match(storeUi, /UNSCHEDULED/);
  assert.match(storeUi, /VERIFY_DUPLICATE/);
  assert.match(app, /data-store-open/);
});

test('Store UI never renders an unknown legacy receivable amount as zero baht', () => {
  const storeUi = read('ui/store-ui.mjs');
  assert.match(storeUi, /outstandingSatang\s*==\s*null/);
  assert.match(storeUi, /ยอดต้องตรวจสอบ/);
});

test('Store overview marks receivable summary unknown when any source amount is ambiguous', () => {
  const storeUi = read('ui/store-ui.mjs');
  assert.match(storeUi, /hasUnknownReceivable/);
  assert.match(storeUi, /storeReceivable[^\n]+hasUnknownReceivable[^\n]+ยอดต้องตรวจสอบ/);
});
