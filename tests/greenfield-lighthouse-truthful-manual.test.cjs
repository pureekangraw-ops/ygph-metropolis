const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const appPath = path.join(root, 'lighthouse-next', 'app.mjs');
const surfacePath = path.join(root, 'lighthouse-next', 'surface-contract.mjs');
const ledgerBridgePath = path.join(root, 'lighthouse-next', 'runtime-ledger.mjs');
const storeBridgePath = path.join(root, 'lighthouse-next', 'runtime-store.mjs');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('Home keeps its finance projection while MANUAL detail authority lives only in surface-contract', () => {
  const app = read(appPath);
  const surface = read(surfacePath);

  assert.match(app, /from ['"]\.\/view-model\.mjs['"]/);
  assert.match(app, /projectFinanceView\(ledgerTruth\)/);
  assert.doesNotMatch(app, /function renderStoreDetail\(|function renderRideDetail\(|function renderCalendarDetail\(|function renderHistoryDetail\(|function openManualTask\(/);

  for (const name of ['renderIncome','renderOutcome','renderCalendar','renderLedger','renderStore','renderRide']) {
    assert.match(surface, new RegExp(`(?:async\\s+)?function ${name}\\(\\)`));
  }
});

test('MANUAL Ride Calendar Store and Ledger read fresh durable owner truth instead of demo snapshots', () => {
  const surface = read(surfacePath);
  const ledgerBridge = read(ledgerBridgePath);
  const storeBridge = read(storeBridgePath);

  assert.match(ledgerBridge, /async function readRideTruth\(/);
  assert.match(ledgerBridge, /async function readCalendarTruth\(/);
  assert.match(storeBridge, /async function readStoreTruth\(/);

  assert.match(surface, /async function renderRide\(\)[\s\S]*?ledgerBridge\.readRideTruth\(\)/);
  assert.match(surface, /async function renderCalendar\(\)[\s\S]*?ledgerBridge\.readCalendarTruth\(\)/);
  assert.match(surface, /async function renderStore\(\)[\s\S]*?storeBridge\.readStoreTruth\(\)/);
  assert.match(surface, /async function renderLedger\(\)[\s\S]*?ledgerBridge\.readLedgerTruth\(\)/);
  assert.doesNotMatch(surface, /state\.products|state\.transactions|state\.obligations/);
});

test('truthful MANUAL distinguishes unavailable owner reads from durable empty state', () => {
  const surface = read(surfacePath);

  assert.match(surface, /ยังอ่าน Store Owner ไม่ได้/);
  assert.match(surface, /ยังอ่าน Ride Owner ไม่ได้/);
  assert.match(surface, /ยังอ่าน Ledger Owner ไม่ได้/);
  assert.match(surface, /ยังอ่านข้อมูลจริงไม่ได้/);

  assert.match(surface, /ยังไม่มีสินค้า/);
  assert.match(surface, /ยังไม่มีรายการ/);
  assert.match(surface, /ไม่มีรายการค้างรับ/);
  assert.match(surface, /ยังไม่มีรายจ่าย/);
  assert.match(surface, /ยังไม่มีภาระ/);
});
