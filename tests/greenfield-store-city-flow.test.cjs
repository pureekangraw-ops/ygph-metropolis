"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('Store exposes truth-first overview and inspection routes without per-product claims', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /data-store-view="overview"/);
  assert.match(html, /data-store-view="receivables"/);
  assert.match(html, /data-store-view="stock-movements"/);
  assert.match(html, /data-store-view="history"/);
  assert.doesNotMatch(html, /SKU|productId|สต็อกรายสินค้า/);
});

test('Store keeps short actions in popup layer', () => {
  const popup = fs.readFileSync(path.join(root, 'ui/action-popups.mjs'), 'utf8');
  for (const task of ['sale','purchase','withdraw','adjust']) assert.match(popup, new RegExp(`'${task}'`));
});

test('Store UI renders receivable relation states without guessing duplicate queues', () => {
  const app = fs.readFileSync(path.join(root, 'ui/app.mjs'), 'utf8');
  assert.match(app, /projectStoreReceivables/);
  assert.match(app, /UNSCHEDULED/);
  assert.match(app, /VERIFY_DUPLICATE/);
  assert.match(app, /data-store-open/);
});

test('Store UI never renders an unknown legacy receivable amount as zero baht', () => {
  const app = fs.readFileSync(path.join(root, 'ui/app.mjs'), 'utf8');
  assert.match(app, /outstandingSatang\s*==\s*null/);
  assert.match(app, /ยอดต้องตรวจสอบ/);
});

test('Store overview marks receivable summary unknown when any source amount is ambiguous', () => {
  const app = fs.readFileSync(path.join(root, 'ui/app.mjs'), 'utf8');
  assert.match(app, /hasUnknownReceivable/);
  assert.match(app, /storeReceivable[^\n]+hasUnknownReceivable[^\n]+ยอดต้องตรวจสอบ/);
});
