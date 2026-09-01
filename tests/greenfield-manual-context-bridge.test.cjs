"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDocument, createManual } = require('./manual-finance-ui-fixture.cjs');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

async function setup(records, callbacks = {}) {
  const { createManualFinanceUi } = await import('../ui/manual-finance-ui.mjs');
  const documentRef = new FakeDocument();
  const manual = createManual(records);
  const ui = createManualFinanceUi({ documentRef, getManual:()=>manual, ...callbacks });
  return { documentRef, manual, ui };
}

test('Manual opens the exact current Detail from a stable reference', async () => {
  const env = await setup({
    'LEDGER/OBL-1':{recordId:'OBL-1',type:'OBLIGATION',title:'ค่าบ้าน',status:'OPEN',remainingSatang:400000},
  });

  const resolved = await env.ui.openReference({version:1,owner:'LEDGER',recordId:'OBL-1'});

  assert.equal(resolved.record.recordId, 'OBL-1');
  assert.equal(env.documentRef.getElementById('outcomeDetail').dataset.recordDetail, 'OBL-1');
  assert.match(env.documentRef.getElementById('outcomeDetail').walk().map(node => node.textContent).join(' '), /ค่าบ้าน/);
});

test('Manual rejects a wrong-owner reference instead of falling back to caller data', async () => {
  const env = await setup({
    'LEDGER/OBL-1':{recordId:'OBL-1',type:'OBLIGATION',title:'ค่าบ้าน',status:'OPEN',remainingSatang:400000},
  });

  await assert.rejects(
    env.ui.openReference({version:1,owner:'CALENDAR',recordId:'OBL-1'}),
    /CONTEXT_REFERENCE_NOT_FOUND/,
  );
  assert.equal(env.documentRef.getElementById('outcomeDetail').hidden, true);
});

test('Manual refreshes the same reference from current Truth', async () => {
  const env = await setup({
    'LEDGER/RCV-1':{recordId:'RCV-1',type:'RECEIVABLE',title:'เงินที่ต้องรับ',status:'OPEN',amountSatang:30000,remainingSatang:30000},
  });
  await env.ui.openReference({version:1,owner:'LEDGER',recordId:'RCV-1'});
  env.manual.records['LEDGER/RCV-1'] = {recordId:'RCV-1',type:'RECEIVABLE',title:'เงินที่ต้องรับ',status:'COMPLETED',amountSatang:30000,remainingSatang:0};

  await env.ui.refreshActiveDetail();

  const detailText = env.documentRef.getElementById('receivableDetail').walk().map(node => node.textContent).join(' ');
  assert.match(detailText, /เสร็จแล้ว/);
  assert.match(detailText, /เหลือ 0 บาท/);
});

test('Manual Ask sends subject plus reference without business Truth', async () => {
  let asked = null;
  const env = await setup({
    'CALENDAR/CAL-1':{recordId:'CAL-1',type:'TODO',title:'จ่ายค่าโทรศัพท์',status:'OPEN',dueDate:'2026-09-10'},
  }, { onAskAbout:payload => { asked = payload; } });
  await env.ui.openReference({version:1,owner:'CALENDAR',recordId:'CAL-1'});
  const ask = env.documentRef.getElementById('manualCalendarDetail').walk().find(node => node.dataset.bridgeAction === 'ask');

  await ask.click();

  assert.deepEqual(asked, {subject:'จ่ายค่าโทรศัพท์',reference:{version:1,owner:'CALENDAR',recordId:'CAL-1'}});
  assert.equal('dueDate' in asked.reference, false);
});

test('an older Detail cannot borrow the reference of a newer Detail', async () => {
  const asked = [];
  const env = await setup({
    'LEDGER/OBL-1':{recordId:'OBL-1',type:'OBLIGATION',title:'ค่าบ้าน',status:'OPEN',remainingSatang:400000},
    'CALENDAR/CAL-1':{recordId:'CAL-1',type:'TODO',title:'จ่ายค่าโทรศัพท์',status:'OPEN',dueDate:'2026-09-10'},
  }, {onAskAbout:payload => asked.push(payload)});
  await env.ui.openReference({version:1,owner:'LEDGER',recordId:'OBL-1'});
  const oldAsk = env.documentRef.getElementById('outcomeDetail').walk().find(node => node.dataset.bridgeAction === 'ask');
  await env.ui.openReference({version:1,owner:'CALENDAR',recordId:'CAL-1'});

  await oldAsk.click();

  assert.deepEqual(asked[0], {subject:'ค่าบ้าน',reference:{version:1,owner:'LEDGER',recordId:'OBL-1'}});
  assert.equal(env.documentRef.getElementById('outcomeDetail').hidden, true);
});

test('Manual exposes Back only when a Chat origin exists', async () => {
  let hasChatOrigin = false;
  const env = await setup({
    'CALENDAR/CAL-1':{recordId:'CAL-1',type:'TODO',title:'จ่ายค่าโทรศัพท์',status:'OPEN',dueDate:'2026-09-10'},
  }, {onBridgeBack:()=>{},canBridgeBack:()=>hasChatOrigin});
  await env.ui.openReference({version:1,owner:'CALENDAR',recordId:'CAL-1'});
  assert.equal(env.documentRef.getElementById('manualCalendarDetail').walk().some(node => node.dataset.bridgeAction === 'back'), false);
  hasChatOrigin = true;
  await env.ui.refreshActiveDetail();
  assert.equal(env.documentRef.getElementById('manualCalendarDetail').walk().some(node => node.dataset.bridgeAction === 'back'), true);
});

test('Manual action commits through Runtime, reads back, and refreshes the same Detail', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const { createManualFourHouses } = await import('../greenfield/manual-four-houses.mjs');
  const { createManualFinanceUi } = await import('../ui/manual-finance-ui.mjs');
  const evidence = signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-BRIDGE-ACTION',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-09-01T00:00:00.000Z', sourceRevision:1,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[{eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:0,calculation:{openingBalanceSatang:0}}},validation:{ownerConfirmation:'UNCONFIRMED'}}],
  });
  const runtime = createGreenfieldRuntime({ store:createMemoryVaultStore(), passphrase:'correct horse battery staple', lockManager:null, now:()=>'2026-09-01T08:00:00.000Z' });
  await runtime.initializeFromEvidence(evidence, {expectedPackageId:'FLOW-BRIDGE-ACTION',expectedRevision:1});
  const manual = createManualFourHouses(runtime, {today:'2026-09-01'});
  await manual.createCalendarItem({workflowId:'CAL-CREATE',recordId:'CAL-HOME',type:'TODO',title:'จัดบ้าน',dueDate:'2026-09-01'});
  const documentRef = new FakeDocument();
  const ui = createManualFinanceUi({documentRef,getManual:()=>manual});
  const reference = {version:1,owner:'CALENDAR',recordId:'CAL-HOME'};
  await ui.openReference(reference);
  const before = documentRef.getElementById('manualCalendarDetail');
  const complete = before.walk().find(node => node.dataset.primaryAction === 'Complete');

  await complete.click();

  assert.equal((await manual.getRecord('CALENDAR','CAL-HOME')).status, 'COMPLETED');
  const after = documentRef.getElementById('manualCalendarDetail');
  assert.equal(after.dataset.recordDetail, 'CAL-HOME');
  assert.match(after.walk().map(node => node.textContent).join(' '), /เสร็จแล้ว/);
  assert.equal(after.walk().some(node => node.dataset.primaryAction === 'Complete'), false);
  runtime.close();
});
