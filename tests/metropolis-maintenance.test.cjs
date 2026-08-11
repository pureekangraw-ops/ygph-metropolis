const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const corePath = path.join(__dirname, '..', 'metropolis-maintenance-core.js');
const runtimePath = path.join(__dirname, '..', 'metropolis-maintenance.js');
const reportRuntimePath = path.join(__dirname, '..', 'metropolis-maintenance-report.js');

function loadCore() {
  delete require.cache[require.resolve(corePath)];
  return require(corePath);
}

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('manual stock increase creates auditable quantity-only plan', () => {
  const core = loadCore();
  const plan = core.planStockAdjustment({
    currentQty: 4,
    mode: 'MANUAL_IN',
    quantity: 2,
    reason: 'STOCK_COUNT_MISMATCH',
    note: 'นับของจริงแล้วเกิน',
    actor: 'OWNER',
    timestamp: '2026-08-11T01:00:00.000Z',
    adjustmentId: 'ADJ-1'
  });
  assert.deepEqual(plan, {
    adjustmentId: 'ADJ-1',
    at: '2026-08-11T01:00:00.000Z',
    actor: 'OWNER',
    movementType: 'MANUAL_IN',
    reason: 'STOCK_COUNT_MISMATCH',
    note: 'นับของจริงแล้วเกิน',
    beforeQty: 4,
    adjustmentQty: 2,
    afterQty: 6,
    affectsLedger: false,
    affectsStockValue: false
  });
});

test('manual stock decrease cannot go below zero', () => {
  const core = loadCore();
  assert.throws(() => core.planStockAdjustment({ currentQty: 1, mode: 'MANUAL_OUT', quantity: 2, reason: 'LOST' }), /ติดลบ/);
});

test('correction mode treats quantity as the physical count and derives delta', () => {
  const core = loadCore();
  const plan = core.planStockAdjustment({ currentQty: 7, mode: 'CORRECTION', quantity: 3, reason: 'STOCK_COUNT_MISMATCH', timestamp: '2026-08-11T01:00:00.000Z', adjustmentId: 'ADJ-2' });
  assert.equal(plan.beforeQty, 7);
  assert.equal(plan.adjustmentQty, -4);
  assert.equal(plan.afterQty, 3);
  assert.equal(plan.movementType, 'CORRECTION');
});

test('stock adjustment requires an allowed reason and respects maximum quantity', () => {
  const core = loadCore();
  assert.throws(() => core.planStockAdjustment({ currentQty: 1, mode: 'MANUAL_IN', quantity: 1, reason: '' }), /เหตุผล/);
  assert.throws(() => core.planStockAdjustment({ currentQty: 999999, mode: 'MANUAL_IN', quantity: 2, reason: 'OTHER', maxQuantity: 1000000 }), /เกินขอบเขต/);
});

test('applying stock adjustment preserves history and ledger while appending movement evidence', () => {
  const core = loadCore();
  const original = {
    store: { stockQty: 2, stockValueSatang: 160000, sales: [{ id: 'S1' }], purchases: [{ id: 'P1' }], withdrawals: [], adjustments: [] },
    ledger: { transactions: [{ id: 'TX1', amountSatang: 80000 }] },
    audit: []
  };
  const plan = core.planStockAdjustment({ currentQty: 2, mode: 'MANUAL_OUT', quantity: 2, reason: 'DAMAGED', timestamp: '2026-08-11T01:00:00.000Z', adjustmentId: 'ADJ-3' });
  const next = core.applyStockAdjustmentToState(original, plan);
  assert.notEqual(next, original);
  assert.equal(original.store.stockQty, 2);
  assert.equal(next.store.stockQty, 0);
  assert.equal(next.store.stockValueSatang, 0);
  assert.deepEqual(next.store.sales, [{ id: 'S1' }]);
  assert.deepEqual(next.store.purchases, [{ id: 'P1' }]);
  assert.deepEqual(next.ledger.transactions, [{ id: 'TX1', amountSatang: 80000 }]);
  assert.equal(next.store.adjustments.length, 1);
  assert.equal(next.store.adjustments[0].adjustmentId, 'ADJ-3');
});

test('partial reset plans only safe operational changes and blocks calendar deletion', () => {
  const core = loadCore();
  const sample = {
    store: { stockQty: 5 },
    ride: { currentRound: { id: 'ROUND-1' }, jobs: [{ id: 'J1' }] },
    settings: { defaultPriceSatang: 90000, lockMinutes: 15, lowStockThreshold: 9, themeColor: 'green', dailyTargetSatang: 100000, dailyPassPercent: 80 },
    calendar: [{ id: 'Q1', source: 'LEDGER' }]
  };
  assert.deepEqual(core.planPartialReset({ domain: 'STORE', state: sample }), { domain: 'STORE', action: 'CORRECT_STOCK_TO_ZERO', currentQty: 5 });
  assert.deepEqual(core.planPartialReset({ domain: 'RIDE', state: sample }), { domain: 'RIDE', action: 'CLEAR_CURRENT_ROUND', hadCurrentRound: true });
  assert.deepEqual(core.planPartialReset({ domain: 'SETTINGS', state: sample }), {
    domain: 'SETTINGS',
    action: 'RESET_OPERATIONAL_PREFERENCES',
    patch: { lockMinutes: 5, lowStockThreshold: 3, themeColor: 'navy', dailyTargetSatang: 0, dailyPassPercent: 70 },
    preserve: { defaultPriceSatang: 90000 }
  });
  assert.throws(() => core.planPartialReset({ domain: 'CALENDAR', state: sample }), /ไม่อนุญาตให้ลบ/);
});

test('destructive confirmation phrases are exact', () => {
  const core = loadCore();
  assert.equal(core.isFactoryConfirmation('RESET'), true);
  assert.equal(core.isFactoryConfirmation(' RESET '), true);
  assert.equal(core.isFactoryConfirmation('reset'), false);
  assert.equal(core.isFullCleanupConfirmation('RESET ALL'), true);
  assert.equal(core.isFullCleanupConfirmation('RESET'), false);
});

test('maintenance cache targeting touches only METROPOLIS app generations and meta cache', () => {
  const core = loadCore();
  assert.deepEqual(core.maintenanceCacheTargets([
    'ygph-metropolis-app-v4.2.5-r20',
    'ygph-metropolis-meta',
    'other-app-cache',
    'ygph-metropolis-app-v4.2.4-r19'
  ]), ['ygph-metropolis-app-v4.2.5-r20', 'ygph-metropolis-meta', 'ygph-metropolis-app-v4.2.4-r19']);
});

test('report correction anchors to the latest physical stock adjustment instead of blindly summing deltas', () => {
  const core = loadCore();
  const adjustments = [
    { at: '2026-08-10T01:00:00.000Z', afterQty: 6, adjustmentQty: -2 },
    { at: '2026-08-11T01:00:00.000Z', afterQty: 7, adjustmentQty: 1 },
    { at: '2026-08-12T01:00:00.000Z', afterQty: 9, adjustmentQty: 2 }
  ];
  const baseByDate = { '2026-08-10': 10, '2026-08-11': 10, '2026-08-12': 11 };
  assert.equal(core.stockReportCorrectionAt(adjustments, '2026-08-11', date => baseByDate[date]), -3);
});

test('browser runtime routes safe mutations through durable commit and destructive reset through local storage adapters', () => {
  const source = readSource(runtimePath);
  assert.match(source, /persistAndRender/);
  assert.match(source, /promptVerifyBalance/);
  assert.match(source, /YGPHMaintenanceCore\.isFactoryConfirmation/);
  assert.match(source, /YGPHMaintenanceCore\.isFullCleanupConfirmation/);
  assert.match(source, /indexedDB\.deleteDatabase/);
  assert.match(source, /navigator\.onLine/);
  assert.match(source, /unregister\(\)/);
  assert.match(source, /Recovery & Reset/);
  assert.match(source, /adjustStockBtn/);
  assert.doesNotMatch(source, /ledger\.transactions\.push/);
  assert.doesNotMatch(source, /addTransaction\s*\(/);
});

test('report adapter uses afterReport hook and stock anchor without patching app.js', () => {
  const source = readSource(reportRuntimePath);
  assert.match(source, /afterReport/);
  assert.match(source, /stockReportCorrectionAt/);
  assert.match(source, /stockAt/);
  assert.match(source, /manualAdjustmentCorrectionQty/);
});
