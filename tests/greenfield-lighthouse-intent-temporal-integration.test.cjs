"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

function temporalRequest(overrides = {}) {
  const businessDate = overrides.businessDate ?? '2026-08-27';
  return {
    version:'1',
    source:'MANUAL',
    requestId:'REQ-temporal-1',
    action:'CREATE',
    object:'EXPENSE',
    fields:{ title:'ข้าว', amountSatang:6500, businessDate },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500, businessDate },
    },
    ...overrides.request,
  };
}

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE',
    formatVersion:3,
    evidenceSchemaVersion:'3.1',
    packageId:'FLOW-LIGHTHOUSE-TEMPORAL',
    packageMode:'SNAPSHOT_AND_DELTA',
    snapshotAsOf:'2026-08-28T01:00:00.000Z',
    sourceRevision:1,
    reconciliation:{ status:'PASS', blockingIssues:[] },
    events:[{
      eventId:'L0', source:'LEDGER', owner:'LEDGER',
      payload:{ record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0, calculation:{ openingBalanceSatang:0 } } },
      validation:{ ownerConfirmation:'UNCONFIRMED' },
    }],
  });
}

test('Task3B01 PATH v1 additively preserves businessDate in fields and Required Result', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  const result = validatePathRequest(temporalRequest());
  assert.equal(result.fields.businessDate, '2026-08-27');
  assert.equal(result.requiredResult.effect.businessDate, '2026-08-27');
});

test('Task3B02 PATH rejects invalid or mismatched businessDate instead of dropping temporal meaning', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  assert.throws(() => validatePathRequest(temporalRequest({ businessDate:'2026-02-30' })), /PATH_INVALID_BUSINESS_DATE/);
  const mismatch = temporalRequest();
  mismatch.requiredResult.effect.businessDate = '2026-08-28';
  assert.throws(() => validatePathRequest(mismatch), /PATH_REQUIRED_RESULT_MISMATCH/);
});

test('Task3B03 expense capability forwards businessDate and proves the same date in readback', async () => {
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const request = temporalRequest();
  let received = null;
  const runtime = {
    async expense(input) { received = input; },
    async readState() {
      return {
        revision:9,
        domains:{ LEDGER:{ records:{
          'TX-LH-REQ-temporal-1': { record:{
            recordId:'TX-LH-REQ-temporal-1', type:'TRANSACTION', direction:'OUT', detail:'OUT:EXPENSE',
            title:'ข้าว', amountSatang:6500, businessDate:'2026-08-27',
          } },
        } } },
      };
    },
  };
  const result = await createExpenseCapability().execute({ request, runtime });
  assert.equal(received.businessDate, '2026-08-27');
  assert.equal(result.evidenceStatus, 'PROVEN');
  assert.equal(result.readback.businessDate, '2026-08-27');
});

test('Task3B04 durable Ledger record stores businessDate separately from execution createdAt', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({
    store,
    passphrase:'correct horse battery staple',
    lockManager:null,
    now:()=>'2026-08-28T01:30:00.000Z',
  });
  await runtime.initializeFromEvidence(minimalEvidence(), {
    expectedPackageId:'FLOW-LIGHTHOUSE-TEMPORAL', expectedRevision:1,
  });
  await runtime.expense({
    workflowId:'WF-LH-REQ-temporal-runtime',
    ledgerTransactionId:'TX-LH-REQ-temporal-runtime',
    title:'ข้าว',
    amountSatang:6500,
    businessDate:'2026-08-27',
  });
  const state = await runtime.readState();
  const record = state.domains.LEDGER.records['TX-LH-REQ-temporal-runtime'].record;
  assert.equal(record.businessDate, '2026-08-27');
  assert.equal(record.createdAt, '2026-08-28T01:30:00.000Z');
  assert.notEqual(record.createdAt.slice(0, 10), record.businessDate);
});
