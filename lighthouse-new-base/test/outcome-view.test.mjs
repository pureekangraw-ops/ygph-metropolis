import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOutcomeView } from '../src/outcome-view.mjs';

function stateWith(...records) {
  const ledger = {};
  for (const record of records) ledger[record.recordId] = { record };
  return { domains:{ LEDGER:{ records:ledger } } };
}

test('Outcome shows วงเงินใช้จ่าย against real cash-out for the Bangkok day', () => {
  const state = stateWith(
    { recordId:'TX-1', type:'TRANSACTION', direction:'OUT', subtype:'EXPENSE', amountSatang:6500, createdAt:'2026-09-02T01:00:00.000Z' },
    { recordId:'TX-2', type:'TRANSACTION', direction:'OUT', subtype:'RIDE_EXPENSE', amountSatang:20000, createdAt:'2026-09-02T09:00:00.000Z' },
    { recordId:'TX-OTHER', type:'TRANSACTION', direction:'OUT', subtype:'EXPENSE', amountSatang:9000, createdAt:'2026-09-01T10:00:00.000Z' },
    { recordId:'ADJ', type:'TRANSACTION', direction:'OUT', subtype:'BALANCE_ADJUSTMENT', amountSatang:5000, createdAt:'2026-09-02T10:00:00.000Z' }
  );

  const view = projectOutcomeView(state, {
    date:'2026-09-02',
    spendingAllowance:{ date:'2026-09-02', allowanceSatang:50000 },
  });

  assert.equal(view.allowanceSatang, 50000);
  assert.equal(view.spentSatang, 26500);
  assert.equal(view.remainingSatang, 23500);
  assert.equal(view.overSatang, 0);
  assert.equal(view.exceeded, false);
});

test('Outcome reports how much the real daily cash-out exceeds วงเงินใช้จ่าย', () => {
  const state = stateWith(
    { recordId:'TX-1', type:'TRANSACTION', direction:'OUT', subtype:'EXPENSE', amountSatang:60000, createdAt:'2026-09-02T02:00:00.000Z' }
  );
  const view = projectOutcomeView(state, {
    date:'2026-09-02',
    spendingAllowance:{ date:'2026-09-02', allowanceSatang:50000 },
  });
  assert.equal(view.remainingSatang, 0);
  assert.equal(view.overSatang, 10000);
  assert.equal(view.exceeded, true);
});

test('Outcome does not pretend zero allowance when no วงเงินใช้จ่าย is set', () => {
  const state = stateWith(
    { recordId:'TX-1', type:'TRANSACTION', direction:'OUT', subtype:'EXPENSE', amountSatang:6500, createdAt:'2026-09-02T01:00:00.000Z' }
  );
  const view = projectOutcomeView(state, { date:'2026-09-02', spendingAllowance:null });
  assert.equal(view.allowanceSatang, null);
  assert.equal(view.spentSatang, 6500);
  assert.equal(view.remainingSatang, null);
  assert.equal(view.overSatang, null);
  assert.equal(view.exceeded, false);
});
