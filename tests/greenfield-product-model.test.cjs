"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function stateWith({ store=[], ledger=[], calendar=[], ride=[] } = {}) {
  const bucket = records => ({ records:Object.fromEntries(records.map(record => [record.recordId, { record }])) });
  return { schema:2, revision:1, domains:{ STORE:bucket(store), LEDGER:bucket(ledger), CALENDAR:bucket(calendar), RIDE:bucket(ride) } };
}

test('time state is shared and deterministic across overdue today near future and closed items', async () => {
  const { deriveTimeState } = await import('../ui/product-model.mjs');
  const today = '2026-08-13';
  assert.equal(deriveTimeState({ dueDate:'2026-08-12', status:'OPEN' }, today), 'OVERDUE');
  assert.equal(deriveTimeState({ dueDate:'2026-08-13', status:'OPEN' }, today), 'TODAY');
  assert.equal(deriveTimeState({ dueDate:'2026-08-20', status:'OPEN' }, today), 'NEAR');
  assert.equal(deriveTimeState({ dueDate:'2026-08-21', status:'OPEN' }, today), 'FUTURE');
  assert.equal(deriveTimeState({ dueDate:'2026-08-01', status:'COMPLETED' }, today), 'COMPLETED');
  assert.equal(deriveTimeState({ dueDate:'2026-08-01', status:'CANCELLED' }, today), 'CANCELLED');
});

test('make money combines generated Store and Ride income without pretending it is spendable balance', async () => {
  const { projectMakeMoney } = await import('../ui/product-model.mjs');
  const state = stateWith({
    store:[{recordId:'S1',type:'SALE',amountSatang:50000,totalSatang:50000,createdAt:'2026-08-13T01:00:00Z'}],
    ride:[{recordId:'R1',type:'JOB',amountSatang:30000,paymentMode:'CREDIT',createdAt:'2026-08-13T02:00:00Z'}],
    ledger:[{recordId:'L1',type:'CURRENT_BALANCE',amountSatang:999999}],
  });
  assert.deepEqual(projectMakeMoney(state, '2026-08-13'), { storeSatang:50000, rideSatang:30000, combinedSatang:80000 });
});

test('daily goal uses robust recent income and raises only when uncovered near obligation pressure is stronger', async () => {
  const { suggestDailyGoal } = await import('../ui/product-model.mjs');
  const history = [10000,10000,10000,10000,10000,1000000,0].map((amountSatang,index)=>({date:`2026-08-0${index+1}`,amountSatang}));
  const baseline = suggestDailyGoal({ dailyIncome:history, balanceSatang:100000, nearObligations:[], today:'2026-08-13' });
  assert.equal(baseline.goalSatang, 10000);
  assert.equal(baseline.baselineSatang, 10000);
  const pressured = suggestDailyGoal({ dailyIncome:history, balanceSatang:10000, nearObligations:[{dueDate:'2026-08-15',amountSatang:50000,status:'OPEN'}], today:'2026-08-13' });
  assert.equal(pressured.pressureSatang, 20000);
  assert.equal(pressured.goalSatang, 20000);
});

test('finance projection keeps spendable balance distinct and computes obligation pressure and payable threshold', async () => {
  const { projectFinance } = await import('../ui/product-model.mjs');
  const state = stateWith({
    ledger:[
      {recordId:'BAL',type:'CURRENT_BALANCE',amountSatang:30000},
      {recordId:'IN1',type:'TRANSACTION',direction:'IN',detail:'IN:OTHER_INCOME',amountSatang:10000,createdAt:'2026-08-13T01:00:00Z'},
      {recordId:'OUT1',type:'TRANSACTION',direction:'OUT',detail:'OUT:EXPENSE',amountSatang:2000,createdAt:'2026-08-13T02:00:00Z'},
      {recordId:'OBL1',type:'OBLIGATION',originalSatang:90000,paidSatang:30000,remainingSatang:60000,status:'PARTIAL'},
    ],
    calendar:[
      {recordId:'Q1',type:'PAY_OBLIGATION_INSTALLMENT',amountSatang:50000,dueDate:'2026-08-16',status:'OPEN',detail:'LEDGER/OBL1'},
      {recordId:'Q2',type:'PAY_OBLIGATION_INSTALLMENT',amountSatang:10000,dueDate:'2026-09-16',status:'OPEN',detail:'LEDGER/OBL1'},
    ],
  });
  const view = projectFinance(state, 30000, '2026-08-13');
  assert.equal(view.spendableBalanceSatang, 30000);
  assert.equal(view.todayInSatang, 10000);
  assert.equal(view.todayOutSatang, 2000);
  assert.equal(view.remainingObligationSatang, 60000);
  assert.equal(view.monthDueSatang, 50000);
  assert.equal(view.nearTermDueSatang, 50000);
  assert.equal(view.shortfallSatang, 20000);
  assert.equal(view.nextDue.amountSatang, 50000);
  assert.equal(view.nextDue.canPayNow, false);
});

test('calendar month grid has 42 cells and flags collision without turning collision into lifecycle status', async () => {
  const { buildMonthGrid } = await import('../ui/product-model.mjs');
  const calendarRecords = [
    {recordId:'Q1',type:'PAY_OBLIGATION',amountSatang:10000,dueDate:'2026-08-15',status:'OPEN'},
    {recordId:'Q2',type:'PAY_OBLIGATION_INSTALLMENT',amountSatang:20000,dueDate:'2026-08-15',status:'OPEN'},
    {recordId:'Q3',type:'PURCHASE_RETURN_WINDOW',amountSatang:0,dueDate:'2026-08-20',status:'OPEN'},
  ];
  const grid = buildMonthGrid({ year:2026, monthIndex:7, calendarRecords, today:'2026-08-13' });
  assert.equal(grid.cells.length, 42);
  const fifteenth = grid.cells.find(cell => cell.date === '2026-08-15');
  assert.equal(fifteenth.count, 2);
  assert.equal(fifteenth.collision, true);
  assert.equal(fifteenth.state, 'NEAR');
  assert.equal(grid.cells.filter(cell => cell.inMonth).length, 31);
});

test('home attention ranks hard problems first, limits to three, and deep-links instead of embedding edits', async () => {
  const { projectAttention } = await import('../ui/product-model.mjs');
  const calendarRecords = [
    {recordId:'OVER',title:'ค้างจ่าย',type:'PAY_OBLIGATION',amountSatang:20000,dueDate:'2026-08-12',status:'OPEN'},
    {recordId:'TODAY',title:'จ่ายวันนี้',type:'PAY_OBLIGATION',amountSatang:50000,dueDate:'2026-08-13',status:'OPEN'},
    {recordId:'NEAR',title:'ใกล้ถึง',type:'PAY_OBLIGATION',amountSatang:90000,dueDate:'2026-08-15',status:'OPEN'},
    {recordId:'NEAR2',title:'ชนวัน',type:'PAY_OBLIGATION',amountSatang:10000,dueDate:'2026-08-15',status:'OPEN'},
  ];
  const attention = projectAttention({ calendarRecords, finance:{spendableBalanceSatang:10000,shortfallSatang:150000}, goal:{goalSatang:100000,generatedSatang:10000}, today:'2026-08-13' });
  assert.equal(attention.length, 3);
  assert.equal(attention[0].kind, 'OVERDUE');
  assert.equal(attention[1].kind, 'TODAY');
  assert.ok(attention.every(item => item.target && item.target.area));
  assert.ok(attention.every(item => !('edit' in item)));
});
