"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE',
    formatVersion:3,
    evidenceSchemaVersion:'3.1',
    packageId:'FLOW-LIGHTHOUSE-PROOF',
    packageMode:'SNAPSHOT_AND_DELTA',
    snapshotAsOf:'2026-08-28T01:00:00.000Z',
    sourceRevision:1,
    reconciliation:{ status:'PASS', blockingIssues:[] },
    events:[
      {
        eventId:'L0',
        source:'LEDGER',
        owner:'LEDGER',
        payload:{ record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0, calculation:{ openingBalanceSatang:0 } } },
        validation:{ ownerConfirmation:'UNCONFIRMED' },
      },
    ],
  });
}

test('LIGHT HOUSE proves ข้าว 65 through Direct Path into durable Greenfield LEDGER Reality', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const { normalizePatternInput } = await import('../lighthouse/pattern-input.mjs');
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const { createPathKernel } = await import('../lighthouse/path-kernel.mjs');

  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({
    store,
    passphrase:'correct horse battery staple',
    lockManager:null,
    now:()=>'2026-08-28T01:30:00.000Z',
  });
  const initial = await runtime.initializeFromEvidence(minimalEvidence(), {
    expectedPackageId:'FLOW-LIGHTHOUSE-PROOF',
    expectedRevision:1,
  });
  assert.equal(initial.status, 'IMPORTED_VERIFIED');

  const normalized = normalizePatternInput('ข้าว 65');
  assert.equal(normalized.status, 'MATCH');

  const ids = ['WF-LH-1', 'TX-LH-1'];
  const capability = createExpenseCapability({ idFactory:() => ids.shift() });
  let gemCalls = 0;
  const kernel = createPathKernel({
    capabilities:[capability],
    gemProcessor:async () => { gemCalls += 1; return { status:'UNRESOLVED' }; },
  });

  const result = await kernel.run(normalized.request, { runtime });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.route, 'DIRECT');
  assert.equal(result.capabilityId, 'EXPENSE_CREATE');
  assert.equal(result.source, 'PATTERN');
  assert.equal(result.readback.recordId, 'TX-LH-1');
  assert.equal(gemCalls, 0);

  const state = await runtime.readState();
  const transaction = state.domains.LEDGER.records['TX-LH-1'].record;
  assert.equal(transaction.type, 'TRANSACTION');
  assert.equal(transaction.direction, 'OUT');
  assert.equal(transaction.subtype, 'EXPENSE');
  assert.equal(transaction.title, 'ข้าว');
  assert.equal(transaction.amountSatang, 6500);
});
