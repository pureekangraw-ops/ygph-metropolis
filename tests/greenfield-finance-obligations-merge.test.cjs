const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const appPath = path.join(root, 'lighthouse-next/app.mjs');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('MANUAL combines finance and obligations into one user task', () => {
  const html = read(htmlPath);
  const app = read(appPath);
  assert.doesNotMatch(html, /data-task=["']obligations["']/);
  assert.match(html, /data-task=["']finance["'][\s\S]*?<strong>การเงิน<\/strong>[\s\S]*?ภาระ/);
  assert.doesNotMatch(html, /manual-finance-merge\.mjs/);
  assert.doesNotMatch(app, /\bobligations:\s*\{\s*title:\s*['"]ภาระ['"]/u);
});

test('finance detail keeps the obligation slot but does not present demo obligation values as real truth', () => {
  const app = read(appPath);
  assert.match(app, /function financeSnapshot\(/);
  const start = app.indexOf('function renderFinanceDetail()');
  const end = app.indexOf('function renderStoreDetail', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = app.slice(start, end);
  assert.match(body, /ภาระใกล้สุด/);
  assert.match(body, /ยังไม่เชื่อมข้อมูลจริง/);
  assert.match(body, /คาดว่าจะเข้า/);
  assert.doesNotMatch(body, /ยังขาด|เป้าวันนี้|state\.obligations/);
});
