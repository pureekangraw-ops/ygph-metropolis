const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const surfacePath = path.join(root, 'lighthouse-next', 'surface-contract.mjs');
const htmlPath = path.join(root, 'lighthouse-next', 'index.html');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('MANUAL dashboard consumes runtime planning truth instead of permanent placeholders', () => {
  const surface = read(surfacePath);
  const html = read(htmlPath);

  for (const id of [
    'home-expected-value',
    'home-obligation-title',
    'home-obligation-due',
    'home-obligation-value',
    'home-gap-value',
    'home-target-value',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
    assert.match(surface, new RegExp(`#${id}`));
  }

  assert.match(surface, /ledgerBridge\.readPlanningTruth\(\)/);
  assert.match(surface, /expectedIncomingSatang/);
  assert.match(surface, /nextObligation/);
  assert.match(surface, /goalSatang/);
  assert.match(surface, /goalGapSatang/);
});

test('Income exposes receivables, pending Ride credit, expected incoming and runtime-owned daily goal editing', () => {
  const surface = read(surfacePath);
  assert.match(surface, /ledgerBridge\.readIncomeTruth\(\)/);
  assert.match(surface, /ledgerBridge\.readRideTruth\(\)/);
  assert.match(surface, /outstandingReceivableSatang/);
  assert.match(surface, /pendingCreditSatang/);
  assert.match(surface, /manual-daily-goal-form/);
  assert.match(surface, /ledgerBridge\.setDailyGoal\(/);
  assert.match(surface, /อ่านกลับจาก Runtime สำเร็จ/);
});

test('Outcome shows spendable balance from calculation authority without inventing a local budget owner', () => {
  const surface = read(surfacePath);
  assert.match(surface, /spendableBalanceSatang/);
  assert.match(surface, /ใช้ได้ตอนนี้/);
  assert.doesNotMatch(surface, /localStorage.*spending|spending.*localStorage/s);
});


test('legacy app finance refresh cannot overwrite planning fields owned by surface contract', () => {
  const app = read(path.join(root, 'lighthouse-next', 'app.mjs'));
  const start = app.indexOf('function renderHomeTruth()');
  const end = app.indexOf('function resetDemoState', start);
  assert.ok(start >= 0 && end > start, 'renderHomeTruth block must exist');
  const body = app.slice(start, end);
  for (const symbol of [
    'homeExpectedValue',
    'homeObligationTitle',
    'homeObligationDue',
    'homeObligationValue',
    'homeGapValue',
    'homeTargetValue',
  ]) {
    assert.doesNotMatch(body, new RegExp(symbol), `${symbol} belongs to planning surface contract`);
  }
});
