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

test('finance detail carries the next obligation, gap, and daily target from shared state', () => {
  const app = read(appPath);
  assert.match(app, /function financeSnapshot\(/);
  assert.match(app, /renderFinanceDetail\([\s\S]*ภาระใกล้สุด/);
  assert.match(app, /renderFinanceDetail\([\s\S]*ยังขาด/);
  assert.match(app, /renderFinanceDetail\([\s\S]*เป้าวันนี้/);
  assert.match(app, /state\.obligations/);
});
