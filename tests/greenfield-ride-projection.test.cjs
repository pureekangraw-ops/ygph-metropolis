"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function stateWith({ ride=[] } = {}) {
  const bucket = records => ({ records:Object.fromEntries(records.map(record => [record.recordId, { record }])) });
  return { schema:2, revision:1, domains:{ STORE:bucket([]), LEDGER:bucket([]), CALENDAR:bucket([]), RIDE:bucket(ride) } };
}

test('Ride state distinguishes NOT_STARTED ACTIVE and COMPLETED for today', async () => {
  const { projectRideState } = await import('../ui/product-model.mjs');

  const blank = stateWith();
  assert.equal(projectRideState(blank, '2026-08-14').todayRoundState, 'NOT_STARTED');

  const active = stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'ACTIVE', startedAt:'2026-08-14T01:00:00.000Z', createdAt:'2026-08-14T01:00:00.000Z', updatedAt:'2026-08-14T01:00:00.000Z' },
  ] });
  const activeView = projectRideState(active, '2026-08-14');
  assert.equal(activeView.todayRoundState, 'ACTIVE');
  assert.equal(activeView.activeRound.recordId, 'R1');
  assert.equal(activeView.latestRound.recordId, 'R1');

  const closed = stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'CLOSED', startedAt:'2026-08-14T01:00:00.000Z', endedAt:'2026-08-14T05:00:00.000Z', createdAt:'2026-08-14T01:00:00.000Z', updatedAt:'2026-08-14T05:00:00.000Z' },
  ] });
  const closedView = projectRideState(closed, '2026-08-14');
  assert.equal(closedView.todayRoundState, 'COMPLETED');
  assert.equal(closedView.activeRound, null);
  assert.equal(closedView.latestRound.recordId, 'R1');
});

test('Ride state does not call an old closed round COMPLETED today', async () => {
  const { projectRideState } = await import('../ui/product-model.mjs');
  const state = stateWith({ ride:[
    { recordId:'R-OLD', type:'ROUND', status:'CLOSED', startedAt:'2026-08-13T01:00:00.000Z', endedAt:'2026-08-13T05:00:00.000Z', createdAt:'2026-08-13T01:00:00.000Z', updatedAt:'2026-08-13T05:00:00.000Z' },
  ] });
  assert.equal(projectRideState(state, '2026-08-14').todayRoundState, 'NOT_STARTED');
});

test('Round summary separates generated cash credit and expenses', async () => {
  const { projectRideRound } = await import('../ui/product-model.mjs');
  const state = stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'CLOSED', startedAt:'2026-08-14T01:00:00.000Z', endedAt:'2026-08-14T05:00:00.000Z' },
    { recordId:'J1', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CASH', amountSatang:12000, createdAt:'2026-08-14T02:00:00.000Z' },
    { recordId:'J2', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CREDIT', amountSatang:18000, createdAt:'2026-08-14T03:00:00.000Z' },
    { recordId:'E1', type:'EXPENSE', roundId:'R1', status:'COMPLETED', amountSatang:5000, createdAt:'2026-08-14T04:00:00.000Z' },
    { recordId:'J-OTHER', type:'JOB', roundId:'R2', status:'COMPLETED', paymentMode:'CASH', amountSatang:99999, createdAt:'2026-08-14T04:30:00.000Z' },
  ] });
  const summary = projectRideRound(state, 'R1');
  assert.equal(summary.roundId, 'R1');
  assert.equal(summary.status, 'CLOSED');
  assert.equal(summary.generatedSatang, 30000);
  assert.equal(summary.cashJobSatang, 12000);
  assert.equal(summary.creditJobSatang, 18000);
  assert.equal(summary.expenseSatang, 5000);
  assert.equal(summary.jobCount, 2);
});

test('Ride today totals separate generated cash credit and expenses', async () => {
  const { projectRideState } = await import('../ui/product-model.mjs');
  const state = stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'ACTIVE', startedAt:'2026-08-14T01:00:00.000Z', createdAt:'2026-08-14T01:00:00.000Z' },
    { recordId:'J1', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CASH', amountSatang:12000, createdAt:'2026-08-14T02:00:00.000Z' },
    { recordId:'J2', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CREDIT', amountSatang:18000, createdAt:'2026-08-14T03:00:00.000Z' },
    { recordId:'E1', type:'EXPENSE', roundId:'R1', status:'COMPLETED', amountSatang:5000, createdAt:'2026-08-14T04:00:00.000Z' },
    { recordId:'J-OLD', type:'JOB', roundId:'R-OLD', status:'COMPLETED', paymentMode:'CASH', amountSatang:7000, createdAt:'2026-08-13T04:00:00.000Z' },
  ] });
  const view = projectRideState(state, '2026-08-14');
  assert.equal(view.generatedSatang, 30000);
  assert.equal(view.cashJobSatang, 12000);
  assert.equal(view.creditJobSatang, 18000);
  assert.equal(view.expenseSatang, 5000);
});

test('pending Ride credit remains visible without an active round', async () => {
  const { projectRideState } = await import('../ui/product-model.mjs');
  const state = stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'CLOSED', startedAt:'2026-08-13T01:00:00.000Z', endedAt:'2026-08-13T05:00:00.000Z' },
    { recordId:'J-CREDIT', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CREDIT', amountSatang:18000, createdAt:'2026-08-13T02:00:00.000Z' },
    { recordId:'WD-1', type:'CREDIT_WITHDRAWAL', status:'COMPLETED', amountSatang:6000, createdAt:'2026-08-13T06:00:00.000Z' },
  ] });
  const view = projectRideState(state, '2026-08-14');
  assert.equal(view.activeRound, null);
  assert.equal(view.pendingCreditSatang, 12000);
});
