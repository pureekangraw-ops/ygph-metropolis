const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const appPath = path.join(root, 'lighthouse-next/app.mjs');
const surfacePath = path.join(root, 'lighthouse-next/surface-contract.mjs');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('MANUAL keeps obligations inside Outcome instead of inventing a Finance or Obligations house', () => {
  const html = read(htmlPath);
  const app = read(appPath);
  const surface = read(surfacePath);

  assert.doesNotMatch(html, /data-task=["']obligations["']/);
  assert.doesNotMatch(html, /data-task=["']finance["']/);
  assert.match(html, /data-task=["']outcome["'][\s\S]*?<strong>Outcome<\/strong><small>รายจ่าย · ภาระ · ค่าใช้จ่ายงาน<\/small>/u);
  assert.match(surface, /ledgerBridge\.createObligation\(/);
  assert.match(surface, /ledgerBridge\.payObligation\(/);
  assert.doesNotMatch(html, /manual-finance-merge\.mjs/);
  assert.doesNotMatch(app, /\bobligations:\s*\{\s*title:\s*['"]ภาระ['"]/u);
});

test('legacy finance projection cannot become the authority for obligations', () => {
  const app = read(appPath);
  assert.match(app, /function financeSnapshot\(/);
  const start = app.indexOf('function renderFinanceDetail()');
  const end = app.indexOf('function renderStoreDetail', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = app.slice(start, end);
  assert.match(body, /ภาระใกล้สุด/);
  assert.match(body, /ยังไม่เชื่อมข้อมูลจริง/);
  assert.doesNotMatch(body, /state\.obligations/);
});
