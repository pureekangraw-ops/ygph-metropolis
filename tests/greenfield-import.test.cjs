"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function evidence() {
  return {
    format: 'YGPH_FLOW_EVENT_EXCHANGE', formatVersion: 3, evidenceSchemaVersion: '3.1',
    packageId: 'FLOW-1786527289637', packageMode: 'SNAPSHOT_AND_DELTA', snapshotAsOf: '2026-08-12T09:34:21.231Z', sourceRevision: 28,
    reconciliation: { status: 'PASS', blockingIssues: [] },
    events: [
      { eventId: 'E1', source: 'STORE', owner: 'STORE', changeType: 'UNCHANGED_SNAPSHOT', payload: { record: { recordId: 'SALE-1', type: 'SALE', amountSatang: 10000 } }, validation: { ownerConfirmation: 'UNCONFIRMED' }, checksum: 'a' },
      { eventId: 'E2', source: 'LEDGER', owner: 'LEDGER', changeType: 'UPDATED', payload: { record: { recordId: 'LEDGER-CURRENT', type: 'CURRENT_BALANCE', amountSatang: 10000 } }, validation: { ownerConfirmation: 'UNCONFIRMED' }, checksum: 'b' },
      { eventId: 'E3', source: 'CALENDAR', owner: 'LEDGER', changeType: 'UNCHANGED_SNAPSHOT', payload: { record: { recordId: 'Q-1', type: 'PAY_OBLIGATION', status: 'OPEN' } }, validation: { ownerConfirmation: 'UNCONFIRMED' }, checksum: 'c' },
      { eventId: 'E4', source: 'RIDE', owner: 'RIDE', changeType: 'UPDATED', payload: { record: { recordId: 'RIDE-CREDIT-BALANCE', type: 'CREDIT_BALANCE', amountSatang: 0 } }, validation: { ownerConfirmation: 'UNCONFIRMED' }, checksum: 'd' }
    ]
  };
}

test('one-time importer imports STORE LEDGER CALENDAR, excludes RIDE, and preserves provenance', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { importEvidenceSnapshot } = await import('../greenfield/import-evidence.mjs');
  const imported = importEvidenceSnapshot(createGreenfieldState(), evidence(), { expectedPackageId: 'FLOW-1786527289637', expectedRevision: 28, importedAt: '2026-08-12T10:01:00.000Z' });
  assert.deepEqual(Object.keys(imported.domains.STORE.records), ['SALE-1']);
  assert.deepEqual(Object.keys(imported.domains.LEDGER.records), ['LEDGER-CURRENT']);
  assert.deepEqual(Object.keys(imported.domains.CALENDAR.records), ['Q-1']);
  assert.equal(imported.meta.importedFrom.packageId, 'FLOW-1786527289637');
  assert.equal(imported.domains.STORE.records['SALE-1'].provenance.ownerConfirmation, 'UNCONFIRMED');
  assert.equal(imported.importReport.excludedByPolicy.RIDE, 1);
  assert.equal(imported.revision, 2);
});

test('one-time importer refuses second import and non-PASS reconciliation', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { importEvidenceSnapshot } = await import('../greenfield/import-evidence.mjs');
  const once = importEvidenceSnapshot(createGreenfieldState(), evidence(), { expectedPackageId: 'FLOW-1786527289637', expectedRevision: 28 });
  assert.throws(() => importEvidenceSnapshot(once, evidence(), { expectedPackageId: 'FLOW-1786527289637', expectedRevision: 28 }), /IMPORT_ALREADY_APPLIED/);
  const broken = evidence(); broken.reconciliation.status = 'FAIL';
  assert.throws(() => importEvidenceSnapshot(createGreenfieldState(), broken, { expectedPackageId: 'FLOW-1786527289637', expectedRevision: 28 }), /EVIDENCE_RECONCILIATION_NOT_PASS/);
});
