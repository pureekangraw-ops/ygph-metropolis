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

test('finance and obligations are one MANUAL user surface, not a patched second route', () => {
  const html = read(htmlPath);
  const app = read(appPath);

  assert.doesNotMatch(html, /data-task=["']obligations["']/);
  assert.doesNotMatch(html, /manual-finance-merge\.mjs/);
  assert.doesNotMatch(app, /\bobligations:\s*\{\s*title:\s*['"]ภาระ['"]/u);
});

test('Dashboard Finance and Calendar derive obligation pressure from the same demo state', () => {
  const app = read(appPath);

  assert.match(app, /const DEFAULT_OBLIGATIONS\s*=\s*Object\.freeze\(\[/);
  assert.match(app, /obligations:\s*DEFAULT_OBLIGATIONS/);
  assert.match(app, /function financeSnapshot\(/);
  assert.match(app, /function renderHomeTruth\([\s\S]*financeSnapshot\(/);
  assert.match(app, /function renderFinanceDetail\([\s\S]*financeSnapshot\(/);
  assert.match(app, /function renderCalendarDetail\([\s\S]*state\.obligations/);
});
