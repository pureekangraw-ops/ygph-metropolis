import test from 'node:test';
import assert from 'node:assert/strict';
import { projectIncomeView } from '../src/income-view.mjs';

function state() {
  return {
    domains: {
      LEDGER: {
        records: {
          'TX-OTHER': { record:{ recordId:'TX-OTHER', type:'TRANSACTION', direction:'IN', subtype:'OTHER_INCOME', title:'รับเงินอื่น', amountSatang:30000, createdAt:'2026-09-02T08:00:00Z' } },
          'TX-RIDE-CASH': { record:{ recordId:'TX-RIDE-CASH', type:'TRANSACTION', direction:'IN', subtype:'RIDE_CASH', title:'รายได้วิ่งงาน', amountSatang:42000, sourceRef:'RIDE/JOB-CASH', createdAt:'2026-09-02T09:00:00Z' } },
          'TX-OUT': { record:{ recordId:'TX-OUT', type:'TRANSACTION', direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500, createdAt:'2026-09-02T10:00:00Z' } },
        },
      },
      RIDE: {
        records: {
          'JOB-CASH': { record:{ recordId:'JOB-CASH', type:'JOB', amountSatang:42000, paymentMode:'CASH', note:'Lalamove cash', createdAt:'2026-09-02T09:00:00Z' } },
          'JOB-CREDIT': { record:{ recordId:'JOB-CREDIT', type:'JOB', amountSatang:50000, paymentMode:'CREDIT', note:'Lalamove credit', createdAt:'2026-09-02T11:00:00Z' } },
        },
      },
    },
  };
}

test('Income view shows real cash-in once and keeps unwithdrawn ride credit distinct', () => {
  const view = projectIncomeView(state());
  assert.equal(view.cashInSatang, 72000);
  assert.equal(view.pendingRideCreditSatang, 50000);
  assert.deepEqual(view.recent.map(item => [item.kind, item.amountSatang]), [
    ['ride-credit', 50000],
    ['cash-in', 42000],
    ['cash-in', 30000],
  ]);
});

test('cash ride income is not duplicated by its RIDE job and its Ledger transaction', () => {
  const view = projectIncomeView(state());
  assert.equal(view.recent.filter(item => item.sourceRef === 'RIDE/JOB-CASH').length, 1);
});

test('Income projection is read-only and does not invent missing money', () => {
  const empty = projectIncomeView({ domains:{ LEDGER:{records:{}}, RIDE:{records:{}} } });
  assert.equal(empty.cashInSatang, 0);
  assert.equal(empty.pendingRideCreditSatang, 0);
  assert.deepEqual(empty.recent, []);
});
