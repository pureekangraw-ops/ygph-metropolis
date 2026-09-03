import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutcomeOwner } from '../src/outcome-owner.mjs';
import { createMemoryDailyControls } from '../src/daily-controls.mjs';

function fakeRuntime() {
  const ledger = {};
  const calendar = {};
  const ride = {};
  let writes = 0;
  return {
    get writes() { return writes; },
    async expense({ ledgerTransactionId, title, amountSatang }) {
      writes += 1;
      ledger[ledgerTransactionId] = { record:{ recordId:ledgerTransactionId, type:'TRANSACTION', direction:'OUT', subtype:'EXPENSE', title, amountSatang } };
    },
    async obligation({ obligationId, title, totalSatang, installments }) {
      writes += 1;
      ledger[obligationId] = { record:{ recordId:obligationId, type:'OBLIGATION', title, totalSatang, paidSatang:0, installmentPlan:installments } };
      for (const item of installments) calendar[item.queueId] = { record:{ recordId:item.queueId, type:'PAY_OBLIGATION_INSTALLMENT', detail:`LEDGER/${obligationId}`, amountSatang:item.amountSatang, paidSatang:0, dueDate:item.dueDate, status:'OPEN' } };
    },
    async rideExpense({ roundId, expenseId, ledgerTransactionId, title, amountSatang }) {
      writes += 1;
      ride[expenseId] = { record:{ recordId:expenseId, type:'EXPENSE', roundId, title, amountSatang } };
      ledger[ledgerTransactionId] = { record:{ recordId:ledgerTransactionId, type:'TRANSACTION', direction:'OUT', subtype:'RIDE_EXPENSE', title, amountSatang, sourceRef:`RIDE/${expenseId}` } };
    },
    async payObligation({ queueId, ledgerTransactionId, amountSatang }) {
      writes += 1;
      const queue = calendar[queueId]?.record;
      const obligationId = String(queue?.detail || '').replace('LEDGER/', '');
      const obligation = ledger[obligationId]?.record;
      obligation.paidSatang += amountSatang;
      queue.paidSatang += amountSatang;
      queue.status = queue.paidSatang >= queue.amountSatang ? 'COMPLETED' : 'PARTIAL';
      ledger[ledgerTransactionId] = { record:{ recordId:ledgerTransactionId, type:'TRANSACTION', direction:'OUT', subtype:'OBLIGATION_PAYMENT', amountSatang, sourceRef:`LEDGER/${obligationId}` } };
    },
    async readState() { return { revision:writes, domains:{ LEDGER:{records:ledger}, CALENDAR:{records:calendar}, RIDE:{records:ride} } }; },
  };
}

test('Outcome records a real expense only after Ledger OUT readback', async () => {
  const owner = createOutcomeOwner({ runtime:fakeRuntime(), idFactory:()=> 'exp-1' });
  const result = await owner.addExpense({ title:'ข้าว', amountSatang:6500 });
  assert.equal(result.owner, 'outcome');
  assert.equal(result.kind, 'expense');
  assert.equal(result.readback.direction, 'OUT');
  assert.equal(result.readback.amountSatang, 6500);
});

test('unpaid obligation stays Outcome + Calendar truth without pretending cash left', async () => {
  const runtime = fakeRuntime();
  const owner = createOutcomeOwner({ runtime, idFactory:()=> 'obl-1' });
  const result = await owner.addObligation({
    title:'ค่าซ่อมห้อง', totalSatang:90000,
    installments:[{ queueId:'Q-10', amountSatang:90000, dueDate:'2026-09-10' }],
  });
  assert.equal(result.owner, 'outcome');
  assert.equal(result.kind, 'obligation');
  assert.equal(result.cashOut, false);
  assert.equal(result.obligation.type, 'OBLIGATION');
  assert.equal(result.calendar[0].recordId, 'Q-10');
  const state = await runtime.readState();
  assert.equal(Object.values(state.domains.LEDGER.records).filter(x => x.record.type === 'TRANSACTION').length, 0);
});

test('ride expense remains Outcome and proves both RIDE attribution and real Ledger OUT', async () => {
  const owner = createOutcomeOwner({ runtime:fakeRuntime(), idFactory:()=> 'ride-exp-1' });
  const result = await owner.recordRideExpense({ roundId:'ROUND-1', title:'ค่าน้ำมัน', amountSatang:20000 });
  assert.equal(result.owner, 'outcome');
  assert.equal(result.kind, 'ride-expense');
  assert.equal(result.ride.amountSatang, 20000);
  assert.equal(result.ledger.direction, 'OUT');
  assert.equal(result.ledger.amountSatang, 20000);
});

test('paying an obligation creates real cash-out and updates the same Calendar queue', async () => {
  const ids = ['obl-pay', 'pay-1'];
  const runtime = fakeRuntime();
  const owner = createOutcomeOwner({ runtime, idFactory:()=> ids.shift() });
  await owner.addObligation({ title:'บ้านเอื้อ', totalSatang:374400, installments:[{ queueId:'Q-30', amountSatang:374400, dueDate:'2026-09-30' }] });
  const result = await owner.payObligation({ queueId:'Q-30', amountSatang:374400 });
  assert.equal(result.owner, 'outcome');
  assert.equal(result.cashOut, true);
  assert.equal(result.ledger.direction, 'OUT');
  assert.equal(result.calendar.recordId, 'Q-30');
  assert.equal(result.calendar.status, 'COMPLETED');
});

test('วงเงินใช้จ่าย is NEW BASE daily control and never mutates money Runtime', async () => {
  const runtime = fakeRuntime();
  const dailyControls = createMemoryDailyControls();
  const owner = createOutcomeOwner({ runtime, dailyControls, idFactory:()=> 'unused' });
  const writesBefore = runtime.writes;

  const result = await owner.setDailySpendingAllowance({ date:'2026-09-02', allowanceSatang:50000 });

  assert.equal(result.owner, 'outcome');
  assert.equal(result.kind, 'daily-spending-allowance');
  assert.equal(result.allowance.date, '2026-09-02');
  assert.equal(result.allowance.allowanceSatang, 50000);
  assert.equal(runtime.writes, writesBefore);
  assert.equal((await dailyControls.getSpendingAllowance('2026-09-02')).allowanceSatang, 50000);
  const state = await runtime.readState();
  assert.equal(Object.values(state.domains.LEDGER.records).filter(x => x.record.type === 'TRANSACTION').length, 0);
});
