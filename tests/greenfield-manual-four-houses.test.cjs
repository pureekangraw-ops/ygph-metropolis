"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-MANUAL-4H',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-09-01T00:00:00.000Z', sourceRevision:1,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[
      {eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:0,calculation:{openingBalanceSatang:0}}},validation:{ownerConfirmation:'UNCONFIRMED'}}
    ]
  });
}

async function setup() {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const { createManualFourHouses } = await import('../greenfield/manual-four-houses.mjs');
  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({ store, passphrase:'correct horse battery staple', lockManager:null, now:()=>'2026-09-01T08:00:00.000Z' });
  await runtime.initializeFromEvidence(minimalEvidence(), { expectedPackageId:'FLOW-MANUAL-4H', expectedRevision:1 });
  return { runtime, manual:createManualFourHouses(runtime, { today:'2026-09-01' }) };
}

test('Income and Outcome keep Expected separate from Actual and settle partial/full with durable readback', async () => {
  const { runtime, manual } = await setup();

  await manual.addIncome({ workflowId:'INC-1', recordId:'TX-IN-1', title:'งานเสริม', amountSatang:50000 });
  await manual.setTarget({ workflowId:'TARGET-1', recordId:'TARGET-SEP', title:'เป้ารายได้กันยา', amountSatang:100000 });
  let income = await manual.incomeSummary();
  assert.equal(income.actualSatang, 50000);
  assert.equal(income.target.amountSatang, 100000);
  assert.equal(income.target.actualSatang, 50000);
  assert.equal(income.target.deltaSatang, 50000);
  assert.equal((await runtime.readState()).domains.LEDGER.records['TARGET-SEP'].record.type, 'TARGET');
  assert.equal((await runtime.readState()).domains.LEDGER.records['TARGET-SEP'].record.direction, undefined, 'target must not be Actual cash truth');

  await manual.createReceivable({ workflowId:'RCV-1', recordId:'RCV-A', title:'ลูกหนี้ A', amountSatang:30000, dueDate:'2026-09-10' });
  let settle = await manual.receiveReceivable({ workflowId:'RCV-P1', receivableId:'RCV-A', transactionId:'TX-RCV-1', amountSatang:10000 });
  assert.equal(settle.readback.status, 'PARTIAL');
  assert.equal(settle.readback.remainingSatang, 20000);
  settle = await manual.receiveReceivable({ workflowId:'RCV-P2', receivableId:'RCV-A', transactionId:'TX-RCV-2', amountSatang:20000 });
  assert.equal(settle.readback.status, 'COMPLETED');
  assert.equal(settle.readback.remainingSatang, 0);

  await manual.addExpense({ workflowId:'EXP-1', recordId:'TX-OUT-1', title:'ค่าเดินทาง', amountSatang:20000 });
  await manual.setCeiling({ workflowId:'CEIL-1', recordId:'CEIL-SEP', title:'เพดานกันยา', amountSatang:60000 });
  const outcome = await manual.outcomeSummary();
  assert.equal(outcome.actualSatang, 20000);
  assert.equal(outcome.ceiling.amountSatang, 60000);
  assert.equal(outcome.ceiling.actualSatang, 20000);
  assert.equal(outcome.ceiling.deltaSatang, 40000);

  await manual.createObligation({ workflowId:'OBL-1', recordId:'OBL-A', queueId:'CAL-OBL-A', title:'ค่าโทรศัพท์', amountSatang:40000, dueDate:'2026-09-05' });
  let obligation = await manual.payObligation({ workflowId:'OBL-P1', obligationId:'OBL-A', queueId:'CAL-OBL-A', transactionId:'TX-OBL-1', amountSatang:15000 });
  assert.equal(obligation.readback.status, 'PARTIAL');
  assert.equal(obligation.readback.remainingSatang, 25000);
  obligation = await manual.payObligation({ workflowId:'OBL-P2', obligationId:'OBL-A', queueId:'CAL-OBL-A', transactionId:'TX-OBL-2', amountSatang:25000 });
  assert.equal(obligation.readback.status, 'COMPLETED');
  assert.equal(obligation.readback.remainingSatang, 0);
});

test('Calendar covers today/upcoming/overdue detail edit reschedule complete and cancel without creating cash by itself', async () => {
  const { runtime, manual } = await setup();
  await manual.createCalendarItem({ workflowId:'CAL-1', recordId:'TODAY', type:'TODO', title:'ซื้อของ', dueDate:'2026-09-01' });
  await manual.createCalendarItem({ workflowId:'CAL-2', recordId:'UP', type:'APPOINTMENT', title:'นัดหมาย', dueDate:'2026-09-03' });
  await manual.createCalendarItem({ workflowId:'CAL-3', recordId:'OLD', type:'DEBT_FOLLOW_UP', title:'ตามหนี้', dueDate:'2026-08-31' });

  assert.deepEqual((await manual.calendarToday()).map(x=>x.recordId), ['TODAY']);
  assert.deepEqual((await manual.calendarUpcoming()).map(x=>x.recordId), ['UP']);
  assert.deepEqual((await manual.calendarOverdue()).map(x=>x.recordId), ['OLD']);
  assert.equal((await manual.getRecord('CALENDAR', 'TODAY')).title, 'ซื้อของ');

  await manual.editCalendar({ workflowId:'CAL-EDIT', recordId:'TODAY', title:'ซื้อของเข้าบ้าน' });
  await manual.rescheduleCalendar({ workflowId:'CAL-MOVE', recordId:'TODAY', dueDate:'2026-09-04' });
  assert.equal((await manual.getRecord('CALENDAR', 'TODAY')).dueDate, '2026-09-04');
  assert.equal((await manual.history('CALENDAR', 'TODAY')).length, 2);

  await manual.completeCalendar({ workflowId:'CAL-DONE', recordId:'TODAY' });
  await manual.cancelCalendar({ workflowId:'CAL-CANCEL', recordId:'UP' });
  assert.equal((await manual.getRecord('CALENDAR', 'TODAY')).status, 'COMPLETED');
  assert.equal((await manual.getRecord('CALENDAR', 'UP')).status, 'CANCELLED');
  const transactions = Object.values((await runtime.readState()).domains.LEDGER.records).filter(e=>e.record.type==='TRANSACTION');
  assert.equal(transactions.length, 0, 'calendar lifecycle alone must not manufacture Actual cash truth');
});

test('Ledger search/history/related/refund/reverse preserve original Actual truth and analyze latest durable state', async () => {
  const { manual } = await setup();
  await manual.addExpense({ workflowId:'E1', recordId:'TX-E1', title:'อาหาร', amountSatang:6500 });
  await manual.editLedgerMetadata({ workflowId:'E1-EDIT', recordId:'TX-E1', title:'อาหารกลางวัน' });
  const edited = await manual.getRecord('LEDGER', 'TX-E1');
  assert.equal(edited.amountSatang, 6500);
  assert.equal(edited.title, 'อาหารกลางวัน');
  assert.equal((await manual.history('LEDGER', 'TX-E1')).length, 1);

  await manual.refund({ workflowId:'E1-REF', originalRecordId:'TX-E1', recordId:'TX-E1-REF', amountSatang:1500, reason:'ร้านคืนบางส่วน' });
  let related = await manual.related('LEDGER', 'TX-E1');
  assert.equal(related.some(x=>x.recordId==='TX-E1-REF' && x.refundOf==='TX-E1'), true);

  await manual.addIncome({ workflowId:'I2', recordId:'TX-I2', title:'เงินเข้าแก้ทดสอบ', amountSatang:8000 });
  await manual.reverse({ workflowId:'I2-REV', originalRecordId:'TX-I2', recordId:'TX-I2-REV', reason:'รายการผิด' });
  related = await manual.related('LEDGER', 'TX-I2');
  assert.equal(related.some(x=>x.recordId==='TX-I2-REV' && x.reversalOf==='TX-I2'), true);

  const search = await manual.searchLedger({ text:'อาหาร' });
  assert.equal(search.some(x=>x.recordId==='TX-E1'), true);
  const dashboard = await manual.dashboard();
  assert.equal(Number.isSafeInteger(dashboard.balanceSatang), true);
  assert.equal(dashboard.incomeActualSatang >= 0, true);
  assert.equal(dashboard.expenseActualSatang >= 0, true);
  const analysis = await manual.analyze();
  assert.equal(analysis.lifecycle.OPEN >= 0, true);
  assert.equal(analysis.lifecycle.PARTIAL >= 0, true);
  assert.equal(analysis.lifecycle.COMPLETED >= 0, true);
  assert.equal(analysis.lifecycle.CANCELLED >= 0, true);
});
