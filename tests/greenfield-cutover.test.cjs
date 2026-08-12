"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function evidence({ snapshotBalance = 10000 } = {}) {
  return {
    format: 'YGPH_FLOW_EVENT_EXCHANGE', formatVersion: 3, evidenceSchemaVersion: '3.1',
    packageId: 'FLOW-1786527289637', packageMode: 'SNAPSHOT_AND_DELTA', snapshotAsOf: '2026-08-12T09:34:21.231Z', sourceRevision: 28,
    reconciliation: { status: 'PASS', blockingIssues: [] },
    events: [
      { eventId: 'S1', source: 'STORE', owner: 'STORE', payload: { record: { recordId: 'SALE-1', type: 'SALE', amountSatang: 10000 } }, validation: { ownerConfirmation: 'UNCONFIRMED' } },
      { eventId: 'L1', source: 'LEDGER', owner: 'LEDGER', payload: { record: { recordId: 'TX-1', type: 'TRANSACTION', detail: 'IN:SALE', amountSatang: 10000, status: 'COMPLETED' } }, validation: { ownerConfirmation: 'UNCONFIRMED' } },
      { eventId: 'L2', source: 'LEDGER', owner: 'LEDGER', payload: { record: { recordId: 'LEDGER-CURRENT', type: 'CURRENT_BALANCE', amountSatang: snapshotBalance, calculation: { openingBalanceSatang: 0 } } }, validation: { ownerConfirmation: 'UNCONFIRMED' } },
      { eventId: 'C1', source: 'CALENDAR', owner: 'STORE', payload: { record: { recordId: 'Q-1', type: 'RECEIVE_CUSTOMER_PAYMENT', status: 'OPEN' } }, validation: { ownerConfirmation: 'UNCONFIRMED' } },
      { eventId: 'R1', source: 'RIDE', owner: 'RIDE', payload: { record: { recordId: 'RIDE-1', type: 'CREDIT_BALANCE', amountSatang: 0 } }, validation: { ownerConfirmation: 'UNCONFIRMED' } }
    ]
  };
}

test('cutover validates evidence and ledger projection before one encrypted durable write', async () => {
  const { createMemoryVaultStore, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { initializeGreenfieldFromEvidence } = await import('../greenfield/cutover.mjs');
  const store = createMemoryVaultStore();
  const first = await initializeGreenfieldFromEvidence({ store, passphrase: 'correct horse battery staple', evidence: evidence(), expectedPackageId: 'FLOW-1786527289637', expectedRevision: 28, now: '2026-08-12T10:20:00.000Z' });
  assert.equal(first.status, 'IMPORTED_VERIFIED');
  assert.equal(first.ledger.status, 'PASS');
  assert.deepEqual(first.counts, { STORE: 1, LEDGER: 2, CALENDAR: 1 });
  const durable = await readEncryptedState({ store, passphrase: 'correct horse battery staple' });
  assert.equal(durable.revision, 2);
  assert.equal('RIDE' in durable.domains, false);
  const second = await initializeGreenfieldFromEvidence({ store, passphrase: 'correct horse battery staple', evidence: evidence(), expectedPackageId: 'FLOW-1786527289637', expectedRevision: 28 });
  assert.equal(second.status, 'ALREADY_INITIALIZED');
  assert.equal(second.state.revision, 2);
});

test('cutover refuses ledger mismatch and leaves greenfield store empty', async () => {
  const { createMemoryVaultStore, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { initializeGreenfieldFromEvidence } = await import('../greenfield/cutover.mjs');
  const store = createMemoryVaultStore();
  await assert.rejects(initializeGreenfieldFromEvidence({ store, passphrase: 'correct horse battery staple', evidence: evidence({ snapshotBalance: 9999 }), expectedPackageId: 'FLOW-1786527289637', expectedRevision: 28 }), /GREENFIELD_LEDGER_RECONCILIATION_FAILED/);
  assert.equal(await readEncryptedState({ store, passphrase: 'correct horse battery staple' }), null);
});

test('repeat initialization uses stored import verification after live Ledger changes instead of rechecking stale snapshot', async () => {
  const { createMemoryVaultStore, readEncryptedState, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const { initializeGreenfieldFromEvidence } = await import('../greenfield/cutover.mjs');
  const store = createMemoryVaultStore();
  await initializeGreenfieldFromEvidence({ store, passphrase:'correct horse battery staple', evidence:evidence(), expectedPackageId:'FLOW-1786527289637', expectedRevision:28, now:'2026-08-12T10:20:00.000Z' });
  const live = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  live.domains.LEDGER.records['TX-LIVE'] = { record:{ recordId:'TX-LIVE', type:'TRANSACTION', detail:'IN:SALE', amountSatang:5000, status:'COMPLETED' }, provenance:{ origin:'LIVE_COMMAND' } };
  live.revision += 1;
  await commitEncryptedState({ store, passphrase:'correct horse battery staple', state:live, expectedDurableRevision:2 });
  const repeat = await initializeGreenfieldFromEvidence({ store, passphrase:'correct horse battery staple', evidence:evidence(), expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
  assert.equal(repeat.status, 'ALREADY_INITIALIZED');
  assert.equal(repeat.importVerification.ledger.status, 'PASS');
  assert.equal(repeat.currentLedgerBalanceSatang, 15000);
});
