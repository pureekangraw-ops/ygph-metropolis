const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const popup = fs.readFileSync('ui/action-popups.mjs', 'utf8');
const count = (text, pattern) => (text.match(pattern) || []).length;

test('Store and Finance expose unified city action launchers while Calendar remains a filter', () => {
  assert.match(popup, /'store-actions':\s*\{[^}]*label:'จัดการร้านค้า'/s);
  assert.match(popup, /'finance-actions':\s*\{[^}]*label:'จัดการการเงิน'/s);
  assert.match(popup, /dataset\.cityActionOpen/);
  assert.match(html, /id="calendarFilter"[^>]*aria-label="กรองสถานะ"/);
});

test('existing business forms remain single-instance and Ride task routing stays present', () => {
  for (const id of ['saleForm','purchaseForm','withdrawForm','adjustForm','incomeForm','expenseForm','obligationForm']) {
    assert.equal(count(html, new RegExp(`id=["']${id}["']`, 'g')), 1, `${id} must exist once`);
  }
  assert.match(popup, /'ride-job'/);
  assert.match(popup, /'ride-expense'/);
  assert.match(popup, /'ride-withdraw'/);
});
