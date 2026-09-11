const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const appPath = path.join(process.cwd(), 'lighthouse-next', 'app.mjs');

function readApp() {
  assert.equal(fs.existsSync(appPath), true, 'missing lighthouse-next/app.mjs');
  return fs.readFileSync(appPath, 'utf8');
}

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing ${start}`);
  assert.ok(to > from, `missing ${end} after ${start}`);
  return source.slice(from, to);
}

test('live LIGHTHOUSE reads Home and MANUAL truth through the pure view-model boundary', () => {
  const app = readApp();
  assert.match(app, /from ['"]\.\/view-model\.mjs['"]/);
  assert.match(app, /projectFinanceView\(ledgerTruth\)/);
  assert.match(app, /projectStoreView\(storeTruth\)/);
  assert.match(app, /projectLedgerHistoryView\(ledgerTruth\)/);
});

test('MANUAL Ride and Calendar show explicit unavailable truth instead of demo values', () => {
  const app = readApp();
  const manualContent = between(app, 'const manualContent =', 'function showManualHub');
  const calendar = between(app, 'function renderCalendarDetail()', 'function transactionLabel');
  const routing = between(app, 'function openManualTask(taskId)', 'function restoreManualView');

  assert.doesNotMatch(manualContent, /ยังไม่เริ่มรอบ|\['รายได้วันนี้','฿0'\]|\['ค่าใช้จ่ายวันนี้','฿0'\]/u);
  assert.doesNotMatch(calendar, /state\.obligations/);
  assert.match(app, /projectUnavailableView\(['"]ยังไม่เชื่อมข้อมูลจริง['"]\)/u);
  assert.match(app, /function renderRideDetail\(/);
  assert.match(routing, /taskId===['"]ride['"].*renderRideDetail\(/);
  assert.match(routing, /taskId===['"]calendar['"].*renderCalendarDetail\(/);
});

test('truthful MANUAL distinguishes unavailable from empty durable Store and Ledger truth', () => {
  const app = readApp();
  const store = between(app, 'function renderStoreDetail()', 'function renderCalendarDetail');
  const history = between(app, 'function renderHistoryDetail()', 'function openManualTask');

  assert.match(store, /READ_STATE\.UNAVAILABLE/);
  assert.match(store, /READ_STATE\.EMPTY/);
  assert.match(store, /ยังไม่มีสินค้า/u);
  assert.match(history, /READ_STATE\.UNAVAILABLE/);
  assert.match(history, /READ_STATE\.EMPTY/);
  assert.match(history, /ยังไม่มีรายการ/u);
});
