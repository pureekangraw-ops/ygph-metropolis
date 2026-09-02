"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

function evidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-1786527289637',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-08-12T09:34:21.231Z', sourceRevision:28,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[{eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:0,calculation:{openingBalanceSatang:0}}},validation:{ownerConfirmation:'UNCONFIRMED'}}],
  });
}

test('วงเงินใช้จ่าย is daily metadata and never creates Ledger money', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const runtime = createGreenfieldRuntime({ store:createMemoryVaultStore(), passphrase:'correct horse battery staple', lockManager:null, now:()=>'2026-09-02T12:00:00.000Z' });
  await runtime.initializeFromEvidence(evidence(), { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });

  const before = await runtime.readState();
  const ledgerBefore = structuredClone(before.domains.LEDGER);
  const result = await runtime.overrideDailySpendingAllowance({ date:'2026-09-02', allowanceSatang:50000 });

  assert.equal(result.allowance.date, '2026-09-02');
  assert.equal(result.allowance.allowanceSatang, 50000);
  assert.equal(result.allowance.source, 'MANUAL');
  assert.equal(result.state.meta.dailySpendingAllowances['2026-09-02'].allowanceSatang, 50000);
  assert.deepEqual(result.state.domains.LEDGER, ledgerBefore);
});
