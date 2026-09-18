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

test('finance and obligations are one MANUAL user surface, not a patched second route', () => {
  const html = read(htmlPath);
  const app = read(appPath);

  assert.doesNotMatch(html, /data-task=["']obligations["']/);
  assert.doesNotMatch(html, /manual-finance-merge\.mjs/);
  assert.doesNotMatch(app, /\bobligations:\s*\{\s*title:\s*['"]ภาระ['"]/u);
});

test('Dashboard uses Ledger truth while MANUAL Outcome and Calendar read fresh owner bridges', () => {
  const app = read(appPath);
  const surface = read(surfacePath);

  assert.match(app, /projectFinanceView/);
  assert.match(app, /function financeSnapshot\(\)[\s\S]*?projectFinanceView\(ledgerTruth\)/);
  assert.match(app, /function renderHomeTruth\(\)[\s\S]*?financeSnapshot\(\)/);
  assert.doesNotMatch(app, /function renderFinanceDetail\(|function renderCalendarDetail\(/);
  assert.match(surface, /async function renderOutcome\(\)[\s\S]*?ledgerBridge\.readLedgerTruth\(\)/);
  assert.match(surface, /async function renderCalendar\(\)[\s\S]*?ledgerBridge\.readCalendarTruth\(\)/);
  assert.doesNotMatch(surface, /state\.obligations/);
});
