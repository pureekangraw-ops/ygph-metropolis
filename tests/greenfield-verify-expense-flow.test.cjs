"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

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

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-1786527289637',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-08-12T09:34:21.231Z', sourceRevision:28,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[
      {eventId:'S0',source:'STORE',owner:'STORE',payload:{record:{recordId:'PURCHASE-BASE',type:'PURCHASE',title:'stock baseline',amountSatang:10000,quantity:1,status:'ACTIVE'}},validation:{ownerConfirmation:'UNCONFIRMED'}},
      {eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:500000,calculation:{openingBalanceSatang:500000}}},validation:{ownerConfirmation:'UNCONFIRMED'}},
    ],
  });
}

function verifySeed({status='OPEN', queueId='QV', amountSatang=104755, title='เช็กค่าไฟ MEA — จ่ายแล้วหรือยัง'} = {}) {
  return {
    format:'YGPH_METRO_FINANCE_SEED', formatVersion:1,
    target:{app:'YGPH METROPOLIS',architecture:'GREENFIELD',stateSchema:2,mode:'ADDITIVE_FINANCE_SEED',nativeBackup:false},
    safety:{doNotUseWithRestore:true},
    commands:[{
      domain:'CALENDAR', type:'CALENDAR_CREATE_RECORD', idempotencyKey:`seed-${queueId}`,
      payload:{record:{recordId:queueId,type:'VERIFY',title,status,amountSatang,dueDate:'2026-08-25',ownerRef:'LEDGER'}},
    }],
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

test('runtime durable path records Ledger OUT and completes an OPEN monetary VERIFY together', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({store,passphrase:'correct horse battery staple',lockManager:null,now:()=> '2026-08-23T08:50:00.000Z'});
  await runtime.initializeFromEvidence(minimalEvidence(), {expectedPackageId:'FLOW-1786527289637',expectedRevision:28});
  await runtime.importFinanceSeed(verifySeed());
  const result = await runtime.verifiedExpense({workflowId:'WF-V',queueId:'QV',ledgerTransactionId:'TX-V',title:'ค่าไฟ MEA',amountSatang:104755});
  assert.equal(result.status,'VERIFIED');
  const state = await runtime.readState();
  const tx = state.domains.LEDGER.records['TX-V'].record;
  assert.equal(tx.direction,'OUT');
  assert.equal(tx.detail,'OUT:VERIFIED_EXPENSE');
  assert.equal(tx.sourceRef,'CALENDAR/QV');
  assert.equal(state.domains.CALENDAR.records.QV.record.status,'COMPLETED');
});

test('runtime repair adds only missing Ledger OUT for a completed VERIFY and blocks a duplicate repair', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({store,passphrase:'correct horse battery staple',lockManager:null,now:()=> '2026-08-23T08:51:00.000Z'});
  await runtime.initializeFromEvidence(minimalEvidence(), {expectedPackageId:'FLOW-1786527289637',expectedRevision:28});
  await runtime.importFinanceSeed(verifySeed({status:'COMPLETED',queueId:'Q-HSEM',amountSatang:137300,title:'เช็ก H SEM MOVE งวด 3/4 — จ่ายแล้วหรือยัง'}));
  const before = await runtime.readState();
  const historyBefore = before.domains.CALENDAR.records['Q-HSEM'].history.length;
  const result = await runtime.verifiedExpense({workflowId:'WF-R',queueId:'Q-HSEM',ledgerTransactionId:'TX-R',title:'H SEM MOVE งวด 3/4',amountSatang:137300});
  assert.equal(result.status,'VERIFIED');
  const after = await runtime.readState();
  assert.equal(after.domains.LEDGER.records['TX-R'].record.detail,'OUT:VERIFIED_EXPENSE');
  assert.equal(after.domains.LEDGER.records['TX-R'].record.sourceRef,'CALENDAR/Q-HSEM');
  assert.equal(after.domains.CALENDAR.records['Q-HSEM'].record.status,'COMPLETED');
  assert.equal(after.domains.CALENDAR.records['Q-HSEM'].history.length,historyBefore);
  const revisionAfter = after.revision;
  await assert.rejects(runtime.verifiedExpense({workflowId:'WF-R2',queueId:'Q-HSEM',ledgerTransactionId:'TX-R2',title:'H SEM MOVE งวด 3/4',amountSatang:137300}), /ACTION_NOT_OPEN|ALREADY_RECORDED/);
  const final = await runtime.readState();
  assert.equal(final.revision,revisionAfter);
  assert.equal(final.domains.LEDGER.records['TX-R2'],undefined);
});

test('UI sends monetary VERIFY into the expense form and does not call calendarStatus directly', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'app.mjs'), 'utf8');
  assert.match(source, /VERIFY_EXPENSE/);
  assert.match(source, /REPAIR_VERIFY_EXPENSE/);
  assert.match(source, /จ่ายแล้ว/);
  assert.match(source, /ygph:open-task/);
  assert.match(source, /verifiedExpense/);
});
