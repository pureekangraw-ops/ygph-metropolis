"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE',
    formatVersion:3,
    evidenceSchemaVersion:'3.1',
    packageId:'FLOW-PHASE1-INTEGRATION',
    packageMode:'SNAPSHOT_AND_DELTA',
    snapshotAsOf:'2026-08-28T01:00:00.000Z',
    sourceRevision:1,
    reconciliation:{ status:'PASS', blockingIssues:[] },
    events:[{
      eventId:'P1-0', source:'LEDGER', owner:'LEDGER',
      payload:{ record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0, calculation:{ openingBalanceSatang:0 } } },
      validation:{ ownerConfirmation:'UNCONFIRMED' },
    }],
  });
}

async function initializedRuntime() {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const runtime = createGreenfieldRuntime({
    store:createMemoryVaultStore(),
    passphrase:'correct horse battery staple',
    lockManager:null,
    now:()=>'2026-08-28T02:00:00.000Z',
  });
  const initial = await runtime.initializeFromEvidence(minimalEvidence(), {
    expectedPackageId:'FLOW-PHASE1-INTEGRATION', expectedRevision:1,
  });
  assert.equal(initial.status, 'IMPORTED_VERIFIED');
  return runtime;
}

async function integrationTools() {
  const { prepareIntentPath } = await import('../lighthouse/intent-path-adapter.mjs');
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const { createPathKernel } = await import('../lighthouse/path-kernel.mjs');
  return {
    prepareIntentPath,
    kernel:createPathKernel({ capabilities:[createExpenseCapability()] }),
  };
}

test('P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER', async () => {
  const { prepareIntentPath, kernel } = await integrationTools();
  const runtime = await initializedRuntime();
  const prepared = prepareIntentPath('ข้าว65', {
    receivedAt:'2026-08-28T01:30:00.000Z', timeZone:'Asia/Bangkok', requestIdFactory:()=>'REQ-p1-a01',
  });
  assert.equal(prepared.status, 'READY');
  assert.equal(prepared.request.fields.title, 'ข้าว');
  assert.equal(prepared.request.fields.amountSatang, 6500);

  const result = await kernel.run(prepared.request, { runtime });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.readback.recordId, 'TX-LH-REQ-p1-a01');

  const state = await runtime.readState();
  const record = state.domains.LEDGER.records['TX-LH-REQ-p1-a01'].record;
  assert.equal(record.detail, 'OUT:EXPENSE');
  assert.equal(record.title, 'ข้าว');
  assert.equal(record.amountSatang, 6500);
});

test('P1A02 prohibited group never becomes a PATH request or Runtime mutation', async () => {
  const { prepareIntentPath } = await integrationTools();
  const prepared = prepareIntentPath('ไม่ต้องลงข้าว65', {
    receivedAt:'2026-08-28T01:30:00.000Z', timeZone:'Asia/Bangkok', requestIdFactory:()=>'REQ-p1-a02',
  });
  assert.equal(prepared.status, 'BLOCKED');
  assert.equal(prepared.reason, 'PROHIBITED_GROUP');
  assert.equal(prepared.request, null);
});

test('P1A03 understood condition is preserved and stops before PATH when unsupported', async () => {
  const { prepareIntentPath } = await integrationTools();
  const prepared = prepareIntentPath('ถ้าฝนตกค่อยลงข้าว65', {
    receivedAt:'2026-08-28T01:30:00.000Z', timeZone:'Asia/Bangkok', requestIdFactory:()=>'REQ-p1-a03',
  });
  assert.equal(prepared.status, 'UNSUPPORTED');
  assert.equal(prepared.reason, 'CONDITION_NOT_SUPPORTED');
  assert.equal(prepared.condition.meaning.kind, 'RAIN');
  assert.equal(prepared.request, null);
});

test('P1A04 relative business date survives Intent -> PATH -> real durable readback', async () => {
  const { prepareIntentPath, kernel } = await integrationTools();
  const runtime = await initializedRuntime();
  const prepared = prepareIntentPath('ข้าว65 เมื่อวาน', {
    receivedAt:'2026-08-28T18:30:00.000Z', timeZone:'Asia/Bangkok', requestIdFactory:()=>'REQ-p1-a04',
  });
  assert.equal(prepared.status, 'READY');
  assert.equal(prepared.temporal.businessDate, '2026-08-28');
  assert.equal(prepared.request.fields.businessDate, '2026-08-28');

  const result = await kernel.run(prepared.request, { runtime });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.readback.businessDate, '2026-08-28');

  const state = await runtime.readState();
  const record = state.domains.LEDGER.records['TX-LH-REQ-p1-a04'].record;
  assert.equal(record.businessDate, '2026-08-28');
  assert.equal(record.createdAt, '2026-08-28T02:00:00.000Z');
});
