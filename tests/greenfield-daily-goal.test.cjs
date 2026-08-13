"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function evidence() {
  return {
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-1786527289637',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-08-12T09:34:21.231Z', sourceRevision:28,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[{eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:0,calculation:{openingBalanceSatang:0}}},validation:{ownerConfirmation:'UNCONFIRMED'}}],
  };
}

test('daily goal is created once per day and later automatic suggestions cannot move it', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const runtime = createGreenfieldRuntime({ store:createMemoryVaultStore(), passphrase:'correct horse battery staple', lockManager:null, now:()=>'2026-08-13T01:00:00.000Z' });
  await runtime.initializeFromEvidence(evidence(), { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
  const first = await runtime.ensureDailyGoal({ date:'2026-08-13', suggestedSatang:120000 });
  assert.equal(first.status, 'CREATED');
  assert.equal(first.goal.goalSatang, 120000);
  assert.equal(first.goal.source, 'AUTO');
  const revision = first.state.revision;
  const second = await runtime.ensureDailyGoal({ date:'2026-08-13', suggestedSatang:999000 });
  assert.equal(second.status, 'EXISTING');
  assert.equal(second.goal.goalSatang, 120000);
  assert.equal(second.state.revision, revision);
});

test('manual override changes only that day target and never creates Ledger money', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const runtime = createGreenfieldRuntime({ store:createMemoryVaultStore(), passphrase:'correct horse battery staple', lockManager:null, now:()=>'2026-08-13T01:00:00.000Z' });
  await runtime.initializeFromEvidence(evidence(), { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
  await runtime.ensureDailyGoal({ date:'2026-08-13', suggestedSatang:120000 });
  const before = await runtime.readState();
  const ledgerBefore = structuredClone(before.domains.LEDGER);
  const overridden = await runtime.overrideDailyGoal({ date:'2026-08-13', goalSatang:150000 });
  assert.equal(overridden.goal.goalSatang, 150000);
  assert.equal(overridden.goal.source, 'MANUAL');
  assert.equal(overridden.goal.autoSuggestedSatang, 120000);
  assert.deepEqual(overridden.state.domains.LEDGER, ledgerBefore);
  const next = await runtime.ensureDailyGoal({ date:'2026-08-14', suggestedSatang:90000 });
  assert.equal(next.goal.goalSatang, 90000);
  assert.equal(next.state.meta.dailyGoals['2026-08-13'].goalSatang, 150000);
  assert.equal(next.state.meta.dailyGoals['2026-08-14'].goalSatang, 90000);
});

test('daily goal accepts a real zero target without treating it as missing', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const runtime = createGreenfieldRuntime({ store:createMemoryVaultStore(), passphrase:'correct horse battery staple', lockManager:null });
  await runtime.initializeFromEvidence(evidence(), { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
  const result = await runtime.ensureDailyGoal({ date:'2026-08-13', suggestedSatang:0 });
  assert.equal(result.goal.goalSatang, 0);
  assert.equal(result.goal.source, 'AUTO');
});
