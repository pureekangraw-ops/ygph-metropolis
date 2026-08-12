"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('ledger projection derives current balance from imported transaction records and reconciles snapshot', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { projectLedgerBalance, checkLedgerSnapshot } = await import('../greenfield/projections.mjs');
  const state = createGreenfieldState();
  state.domains.LEDGER.records = {
    A: { record: { recordId: 'A', type: 'TRANSACTION', detail: 'IN:SALE', amountSatang: 50000, status: 'COMPLETED' }, provenance: {} },
    B: { record: { recordId: 'B', type: 'TRANSACTION', detail: 'OUT:EXPENSE', amountSatang: 12500, status: 'COMPLETED' }, provenance: {} },
    C: { record: { recordId: 'C', type: 'TRANSACTION', detail: 'OUT:OLD', amountSatang: 9000, status: 'CANCELLED' }, provenance: {} },
    CURRENT: { record: { recordId: 'LEDGER-CURRENT', type: 'CURRENT_BALANCE', amountSatang: 47500, calculation: { openingBalanceSatang: 10000 } }, provenance: {} }
  };
  assert.equal(projectLedgerBalance(state), 47500);
  assert.deepEqual(checkLedgerSnapshot(state), { status: 'PASS', calculatedBalanceSatang: 47500, snapshotBalanceSatang: 47500 });
});

test('ledger projection reports mismatch instead of rewriting evidence', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { checkLedgerSnapshot } = await import('../greenfield/projections.mjs');
  const state = createGreenfieldState();
  state.domains.LEDGER.records = {
    A: { record: { recordId: 'A', type: 'TRANSACTION', detail: 'IN:SALE', amountSatang: 10000, status: 'COMPLETED' }, provenance: {} },
    CURRENT: { record: { recordId: 'LEDGER-CURRENT', type: 'CURRENT_BALANCE', amountSatang: 9999, calculation: { openingBalanceSatang: 0 } }, provenance: {} }
  };
  assert.equal(checkLedgerSnapshot(state).status, 'MISMATCH');
  assert.equal(state.domains.LEDGER.records.CURRENT.record.amountSatang, 9999);
});
