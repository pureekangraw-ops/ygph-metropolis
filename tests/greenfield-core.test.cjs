"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('greenfield schema 2 contains STORE LEDGER CALENDAR and RIDE domains', async () => {
  const { createGreenfieldState, validateGreenfieldState } = await import('../greenfield/core.mjs');
  const state = createGreenfieldState({ now: '2026-08-12T10:00:00.000Z' });
  assert.equal(state.schema, 2);
  assert.equal(state.revision, 1);
  assert.deepEqual(Object.keys(state.domains).sort(), ['CALENDAR', 'LEDGER', 'RIDE', 'STORE']);
  assert.equal(validateGreenfieldState(state).ok, true);
});

test('schema 1 migrates to schema 2 without changing existing durable truth', async () => {
  const { migrateGreenfieldState, validateGreenfieldState } = await import('../greenfield/core.mjs');
  const legacy = {
    schema: 1,
    revision: 27,
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T01:00:00.000Z',
    meta: { architecture: 'GREENFIELD', importedFrom: { packageId: 'FLOW-1786527289637', sourceRevision: 28 }, importVerification: { status: 'PASS' } },
    domains: {
      STORE: { records: { S1: { record: { recordId: 'S1', type: 'SALE', amountSatang: 10000 }, provenance: { origin: 'EVIDENCE_IMPORT' } } } },
      LEDGER: { records: { L1: { record: { recordId: 'L1', type: 'CURRENT_BALANCE', amountSatang: 464200 }, provenance: { origin: 'EVIDENCE_IMPORT' } } } },
      CALENDAR: { records: { C1: { record: { recordId: 'C1', type: 'PAY_OBLIGATION', amountSatang: 50000, status: 'OPEN' }, provenance: { origin: 'EVIDENCE_IMPORT' } } } },
    },
    commandLog: { keep: { commandId: 'keep', revision: 27 } },
    importReport: { imported: { STORE: 1, LEDGER: 1, CALENDAR: 1 } },
  };
  const migrated = migrateGreenfieldState(legacy);
  assert.equal(migrated.schema, 2);
  assert.equal(migrated.revision, 27);
  assert.deepEqual(migrated.domains.STORE, legacy.domains.STORE);
  assert.deepEqual(migrated.domains.LEDGER, legacy.domains.LEDGER);
  assert.deepEqual(migrated.domains.CALENDAR, legacy.domains.CALENDAR);
  assert.deepEqual(migrated.domains.RIDE, { records: {} });
  assert.deepEqual(migrated.commandLog, legacy.commandLog);
  assert.deepEqual(migrated.meta, legacy.meta);
  assert.deepEqual(migrated.importReport, legacy.importReport);
  assert.equal(validateGreenfieldState(migrated).ok, true);
});

test('greenfield validation rejects unknown domains after migration', async () => {
  const { createGreenfieldState, validateGreenfieldState } = await import('../greenfield/core.mjs');
  const state = createGreenfieldState();
  state.domains.UNKNOWN = { records: {} };
  const result = validateGreenfieldState(state);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /UNEXPECTED_DOMAIN:UNKNOWN/);
});
