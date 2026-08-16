"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-1786527289637',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-08-12T09:34:21.231Z', sourceRevision:28,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[
      {eventId:'S0',source:'STORE',owner:'STORE',payload:{record:{recordId:'PURCHASE-BASE',type:'PURCHASE',title:'stock baseline',amountSatang:10000,quantity:1,status:'ACTIVE'}},validation:{ownerConfirmation:'UNCONFIRMED'}},
      {eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:50000,calculation:{openingBalanceSatang:50000}}},validation:{ownerConfirmation:'UNCONFIRMED'}}
    ]
  });
}

test('queue-only Calendar payment intent resolves owner in runtime and persists all three truths', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({store,passphrase:'correct horse battery staple',lockManager:null,now:()=> '2026-08-16T04:00:00.000Z'});
  await runtime.initializeFromEvidence(minimalEvidence(), {expectedPackageId:'FLOW-1786527289637',expectedRevision:28});
  await runtime.obligation({
    workflowId:'WF-OBL', obligationId:'OBL1', title:'ค่าซ่อม', totalSatang:30000,
    installments:[{queueId:'Q1',amountSatang:30000,dueDate:'2026-08-16'}],
  });
  const result = await runtime.payObligation({workflowId:'WF-PAY',queueId:'Q1',ledgerTransactionId:'TX-PAY',amountSatang:10000});
  assert.equal(result.status,'VERIFIED');
  const state = await runtime.readState();
  assert.equal(state.domains.LEDGER.records.OBL1.record.remainingSatang,20000);
  assert.equal(state.domains.LEDGER.records.OBL1.record.status,'PARTIAL');
  assert.equal(state.domains.LEDGER.records['TX-PAY'].record.direction,'OUT');
  assert.equal(state.domains.LEDGER.records['TX-PAY'].record.amountSatang,10000);
  assert.equal(state.domains.CALENDAR.records.Q1.record.amountSatang,20000);
  assert.equal(state.domains.CALENDAR.records.Q1.record.status,'PARTIAL');
  assert.equal(runtime.project().ledgerBalanceSatang,40000);
});

test('runtime rejects overpayment before any durable mutation', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({store,passphrase:'correct horse battery staple',lockManager:null,now:()=> '2026-08-16T04:00:00.000Z'});
  await runtime.initializeFromEvidence(minimalEvidence(), {expectedPackageId:'FLOW-1786527289637',expectedRevision:28});
  await runtime.obligation({workflowId:'WF-OBL',obligationId:'OBL1',title:'ค่าซ่อม',totalSatang:30000,installments:[{queueId:'Q1',amountSatang:30000,dueDate:'2026-08-16'}]});
  const before = await runtime.readState();
  await assert.rejects(runtime.payObligation({workflowId:'WF-BAD',queueId:'Q1',ledgerTransactionId:'TX-BAD',amountSatang:30001}), /PAYMENT_OVER_REMAINING/);
  const after = await runtime.readState();
  assert.equal(after.revision,before.revision);
  assert.equal(after.domains.LEDGER.records.OBL1.record.remainingSatang,30000);
  assert.equal(after.domains.CALENDAR.records.Q1.record.amountSatang,30000);
  assert.equal(after.domains.LEDGER.records['TX-BAD'],undefined);
});
