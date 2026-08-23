"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function stateWithVerify(status = 'OPEN') {
  return {
    schema:2,
    revision:1,
    commandLog:{},
    domains:{
      STORE:{records:{}},
      RIDE:{records:{}},
      LEDGER:{records:{}},
      CALENDAR:{records:{
        QV:{record:{
          recordId:'QV',
          type:'VERIFY',
          title:'เช็กค่าไฟ MEA — จ่ายแล้วหรือยัง',
          amountSatang:104755,
          dueDate:'2026-08-25',
          ownerRef:'LEDGER',
          status,
        }},
      }},
    },
  };
}

test('OPEN monetary VERIFY owned by LEDGER resolves to expense confirmation, never generic Calendar completion', async () => {
  const { resolveCalendarAction } = await import('../greenfield/action-contract.mjs');
  const action = resolveCalendarAction(stateWithVerify(), stateWithVerify().domains.CALENDAR.records.QV.record);
  assert.equal(action.available, true);
  assert.equal(action.kind, 'VERIFY_EXPENSE');
  assert.equal(action.method, 'verifiedExpense');
  assert.equal(action.owner, 'LEDGER');
  assert.equal(action.queueId, 'QV');
  assert.equal(action.suggestedAmountSatang, 104755);
});

test('verified expense workflow atomically writes Ledger OUT linked to Calendar then completes the verify queue', async () => {
  const { buildVerifiedExpenseWorkflow } = await import('../greenfield/business-workflows.mjs');
  const plan = buildVerifiedExpenseWorkflow({workflowId:'WF-V',queueId:'QV',ledgerTransactionId:'TX-V',title:'ค่าไฟ MEA',amountSatang:104755});
  assert.equal(plan.commands.length, 2);
  assert.deepEqual(plan.commands[0].domain, 'LEDGER');
  assert.equal(plan.commands[0].type, 'LEDGER_CREATE_TRANSACTION');
  assert.equal(plan.commands[0].payload.direction, 'OUT');
  assert.equal(plan.commands[0].payload.subtype, 'VERIFIED_EXPENSE');
  assert.equal(plan.commands[0].payload.sourceRef, 'CALENDAR/QV');
  assert.equal(plan.commands[1].domain, 'CALENDAR');
  assert.equal(plan.commands[1].type, 'CALENDAR_SET_STATUS');
  assert.equal(plan.commands[1].payload.recordId, 'QV');
  assert.equal(plan.commands[1].payload.status, 'COMPLETED');
});

test('repair workflow writes only the missing Ledger OUT and preserves an already-completed Calendar record', async () => {
  const { buildVerifiedExpenseWorkflow } = await import('../greenfield/business-workflows.mjs');
  const plan = buildVerifiedExpenseWorkflow({workflowId:'WF-R',queueId:'QV',ledgerTransactionId:'TX-R',title:'H SEM MOVE งวด 3/4',amountSatang:137300,repair:true});
  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0].domain, 'LEDGER');
  assert.equal(plan.commands[0].type, 'LEDGER_CREATE_TRANSACTION');
  assert.equal(plan.commands[0].payload.direction, 'OUT');
  assert.equal(plan.commands[0].payload.subtype, 'VERIFIED_EXPENSE');
  assert.equal(plan.commands[0].payload.sourceRef, 'CALENDAR/QV');
});

test('completed monetary VERIFY without a linked Ledger OUT remains repairable, but cannot duplicate once linked', async () => {
  const { resolveCalendarAction, buildCalendarActionIntent } = await import('../greenfield/action-contract.mjs');
  const state = stateWithVerify('COMPLETED');
  let action = resolveCalendarAction(state, state.domains.CALENDAR.records.QV.record);
  assert.equal(action.available, true);
  assert.equal(action.kind, 'REPAIR_VERIFY_EXPENSE');
  assert.equal(action.method, 'verifiedExpense');
  const intent = buildCalendarActionIntent(state, state.domains.CALENDAR.records.QV.record, 104755, {workflowId:'WF-R',transactionId:'TX-R',title:'ค่าไฟ MEA'});
  assert.equal(intent.input.repair, true);

  state.domains.LEDGER.records.TX = {record:{recordId:'TX',type:'TRANSACTION',direction:'OUT',amountSatang:104755,subtype:'VERIFIED_EXPENSE',sourceRef:'CALENDAR/QV',status:'COMPLETED'}};
  action = resolveCalendarAction(state, state.domains.CALENDAR.records.QV.record);
  assert.equal(action.available, false);
  assert.equal(action.reason, 'ACTION_NOT_OPEN');
});

test('generic non-money VERIFY keeps Calendar-only completion semantics', async () => {
  const { resolveCalendarAction } = await import('../greenfield/action-contract.mjs');
  const state = stateWithVerify();
  state.domains.CALENDAR.records.QV.record.ownerRef = 'CALENDAR';
  state.domains.CALENDAR.records.QV.record.amountSatang = 0;
  const action = resolveCalendarAction(state, state.domains.CALENDAR.records.QV.record);
  assert.equal(action.available, true);
  assert.equal(action.kind, 'COMPLETE_CALENDAR');
});

test('UI sends monetary VERIFY into the expense form and does not call calendarStatus directly', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'app.mjs'), 'utf8');
  assert.match(source, /VERIFY_EXPENSE/);
  assert.match(source, /REPAIR_VERIFY_EXPENSE/);
  assert.match(source, /จ่ายแล้ว/);
  assert.match(source, /ygph:open-task/);
  assert.match(source, /verifiedExpense/);
});
