import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualDashboard } from '../src/manual-dashboard.mjs';

const today = {
  income: 1250,
  outcome: 430,
  dueToday: 2,
  events: ['ค่าซ่อมห้อง'],
};

test('MANUAL dashboard answers today first and exposes exactly four current houses', () => {
  const view = createManualDashboard(today);
  assert.equal(view.heading, 'วันนี้เป็นอย่างไร');
  assert.deepEqual(view.today, today);
  assert.deepEqual(view.houses.map(({ id }) => id), [
    'income', 'outcome', 'calendar', 'ledger',
  ]);
});

test('current house doors route directly and do not resurrect old peer houses', () => {
  const view = createManualDashboard(today);
  assert.deepEqual(view.houses.map(({ id, route }) => [id, route]), [
    ['income', 'income'],
    ['outcome', 'outcome'],
    ['calendar', 'calendar'],
    ['ledger', 'ledger'],
  ]);
  assert.equal(view.houses.some(({ id }) => ['money', 'store', 'ride'].includes(id)), false);
});
