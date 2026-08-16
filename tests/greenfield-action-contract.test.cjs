"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function rootFile(name) { return fs.readFileSync(path.join(__dirname, '..', name), 'utf8'); }

function minimalState() {
  return {
    schema:2, revision:7,
    domains:{
      STORE:{records:{}},
      LEDGER:{records:{
        OBL1:{record:{recordId:'OBL1',type:'OBLIGATION',title:'ค่าซ่อม',totalSatang:60000,amountSatang:60000,paidSatang:0,remainingSatang:60000,status:'OPEN',installmentPlan:[{queueId:'Q1',amountSatang:30000,dueDate:'2026-08-15'},{queueId:'Q2',amountSatang:30000,dueDate:'2026-09-15'}]}}
      }},
      CALENDAR:{records:{
        Q1:{record:{recordId:'Q1',type:'PAY_OBLIGATION_INSTALLMENT',title:'จ่ายงวดภาระ',detail:'',amountSatang:30000,paidSatang:0,dueDate:'2026-08-15',status:'OPEN'}},
        Q2:{record:{recordId:'Q2',type:'PAY_OBLIGATION_INSTALLMENT',title:'จ่ายงวดภาระ',detail:'LEDGER/OBL1',amountSatang:30000,paidSatang:0,dueDate:'2026-09-15',status:'OPEN'}}
      }},
      RIDE:{records:{}}
    }
  };
}

test('Calendar payment action resolves canonical Ledger owner from obligation installment plan even when queue detail is missing', async () => {
  const { resolveCalendarAction } = await import('../ui/action-contract.mjs');
  const state = minimalState();
  const queue = state.domains.CALENDAR.records.Q1.record;
  const action = resolveCalendarAction(state, queue);
  assert.equal(action.available, true);
  assert.equal(action.kind, 'PAY_OBLIGATION');
  assert.equal(action.owner, 'LEDGER');
  assert.equal(action.sourceId, 'OBL1');
  assert.equal(action.method, 'payObligation');
  assert.equal(action.maxAmountSatang, 30000);
});

test('Calendar action fails closed when no unique source owner can be proven', async () => {
  const { resolveCalendarAction } = await import('../ui/action-contract.mjs');
  const state = minimalState();
  state.domains.LEDGER.records = {};
  const queue = state.domains.CALENDAR.records.Q1.record;
  const action = resolveCalendarAction(state, queue);
  assert.equal(action.available, false);
  assert.match(action.reason, /SOURCE/);
});

test('Calendar action fails closed when two source records claim the same queue', async () => {
  const { resolveCalendarAction } = await import('../ui/action-contract.mjs');
  const state = minimalState();
  state.domains.LEDGER.records.OBL2 = {record:{recordId:'OBL2',type:'OBLIGATION',remainingSatang:30000,status:'OPEN',installmentPlan:[{queueId:'Q1',amountSatang:30000,dueDate:'2026-08-15'}]}};
  const action = resolveCalendarAction(state, state.domains.CALENDAR.records.Q1.record);
  assert.equal(action.available, false);
  assert.match(action.reason, /AMBIGUOUS/);
});

test('payment intent rejects zero and over-remaining amounts before runtime execution', async () => {
  const { buildCalendarActionIntent } = await import('../ui/action-contract.mjs');
  const state = minimalState();
  const queue = state.domains.CALENDAR.records.Q1.record;
  assert.throws(() => buildCalendarActionIntent(state, queue, 0, {workflowId:'WF',transactionId:'TX'}), /INVALID_PAYMENT_AMOUNT/);
  assert.throws(() => buildCalendarActionIntent(state, queue, 30001, {workflowId:'WF',transactionId:'TX'}), /PAYMENT_OVER_REMAINING/);
  const intent = buildCalendarActionIntent(state, queue, 15000, {workflowId:'WF',transactionId:'TX'});
  assert.equal(intent.method, 'payObligation');
  assert.equal(intent.input.obligationId, 'OBL1');
  assert.equal(intent.input.queueId, 'Q1');
  assert.equal(intent.input.amountSatang, 15000);
});

test('workflow invariant accepts a proven obligation-plan relation even when Calendar display detail is missing', async () => {
  const { buildPayObligationWorkflow } = await import('../greenfield/business-workflows.mjs');
  const { validateWorkflowInvariants } = await import('../greenfield/workflow-invariants.mjs');
  const state = minimalState();
  const plan = buildPayObligationWorkflow({workflowId:'WF-PAY',obligationId:'OBL1',queueId:'Q1',ledgerTransactionId:'TX-PAY',amountSatang:10000});
  assert.deepEqual(validateWorkflowInvariants(state, plan.commands), {status:'PASS'});
});

test('partial payment keeps Finance and Calendar projection totals reconciled to remaining truth', async () => {
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const { buildPayObligationWorkflow } = await import('../greenfield/business-workflows.mjs');
  const { projectFinance } = await import('../ui/product-model.mjs');
  const rt = createCommandRuntime(); registerGreenfieldDomainCommands(rt, {now:()=> '2026-08-16T04:00:00.000Z'});
  let state = minimalState();
  for (const command of buildPayObligationWorkflow({workflowId:'WF-PAY',obligationId:'OBL1',queueId:'Q1',ledgerTransactionId:'TX-PAY',amountSatang:10000}).commands) {
    state = await rt.execute(state, {...command,expectedRevision:state.revision});
  }
  const finance = projectFinance(state, -10000, '2026-08-16', 60);
  assert.equal(state.domains.LEDGER.records.OBL1.record.remainingSatang, 50000);
  assert.equal(state.domains.CALENDAR.records.Q1.record.amountSatang, 20000);
  assert.equal(finance.remainingObligationSatang, 50000);
  assert.equal(finance.nearTermDueSatang, 50000);
});

test('every static non-submit button has an explicit action owner', () => {
  const html = rootFile('index.html');
  const sources = [rootFile('app.mjs'), rootFile('ui/app.mjs'), rootFile('ui/ride-ui.mjs'), rootFile('ui/action-popups.mjs')].join('\n');
  const tags = [...html.matchAll(/<button\b([^>]*)>/g)].map(match => match[1]);
  const orphan = [];
  for (const attrs of tags) {
    const type = /\btype="([^"]+)"/.exec(attrs)?.[1] || 'submit';
    if (type === 'submit') continue;
    if (/\bdata-(?:destination|city-entry|store-open|ride-open)="/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (!id) { orphan.push(attrs.trim()); continue; }
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const explicit = new RegExp(`(?:\\$\\(['\"]${escaped}['\"]\\)|getElementById\\(['\"]${escaped}['\"]\\))[\\s\\S]{0,1200}?addEventListener\\(['\"](?:click|submit)['\"]`).test(sources);
    if (!explicit) orphan.push(id);
  }
  assert.deepEqual(orphan, [], `orphan buttons: ${orphan.join(', ')}`);
});
