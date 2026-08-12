"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('built-in commands create Store records and immutable Ledger transactions', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-12T10:30:00.000Z' });
  let state = createGreenfieldState({ now: '2026-08-12T10:00:00.000Z' });
  state = await runtime.execute(state, {
    commandId: 'C-STORE-1', idempotencyKey: 'K-STORE-1', domain: 'STORE', type: 'STORE_CREATE_RECORD', expectedRevision: 1,
    payload: { record: { recordId: 'SALE-NEW', type: 'SALE', title: 'ขายเงินสด', amountSatang: 12000, quantity: 1, status: 'COMPLETED' } }
  });
  assert.equal(state.domains.STORE.records['SALE-NEW'].record.source, 'STORE');
  assert.equal(state.domains.STORE.records['SALE-NEW'].provenance.origin, 'LIVE_COMMAND');
  assert.deepEqual(state.domains.STORE.records['SALE-NEW'].history, []);

  state = await runtime.execute(state, {
    commandId: 'C-LEDGER-1', idempotencyKey: 'K-LEDGER-1', domain: 'LEDGER', type: 'LEDGER_CREATE_TRANSACTION', expectedRevision: 2,
    payload: { recordId: 'TX-NEW', direction: 'IN', amountSatang: 12000, title: 'ขายเงินสด', subtype: 'SALE', sourceRef: 'STORE/SALE-NEW' }
  });
  const tx = state.domains.LEDGER.records['TX-NEW'].record;
  assert.equal(tx.type, 'TRANSACTION');
  assert.equal(tx.detail, 'IN:SALE');
  assert.equal(tx.amountSatang, 12000);
  assert.equal(tx.sourceRef, 'STORE/SALE-NEW');
});

test('ledger reversal is append-only and a second reversal is rejected', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-12T10:30:00.000Z' });
  let state = createGreenfieldState();
  state = await runtime.execute(state, { commandId:'C1', idempotencyKey:'K1', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', expectedRevision:1, payload:{ recordId:'TX1', direction:'OUT', amountSatang:5000, title:'จ่าย', subtype:'PAYMENT' } });
  const originalBefore = structuredClone(state.domains.LEDGER.records.TX1);
  state = await runtime.execute(state, { commandId:'C2', idempotencyKey:'K2', domain:'LEDGER', type:'LEDGER_REVERSE_TRANSACTION', expectedRevision:2, payload:{ originalRecordId:'TX1', reversalRecordId:'TX1-R', reason:'แก้รายการผิด' } });
  assert.deepEqual(state.domains.LEDGER.records.TX1, originalBefore);
  assert.equal(state.domains.LEDGER.records['TX1-R'].record.detail, 'IN:REVERSAL');
  assert.equal(state.domains.LEDGER.records['TX1-R'].record.reversalOf, 'TX1');
  await assert.rejects(runtime.execute(state, { commandId:'C3', idempotencyKey:'K3', domain:'LEDGER', type:'LEDGER_REVERSE_TRANSACTION', expectedRevision:3, payload:{ originalRecordId:'TX1', reversalRecordId:'TX1-R2', reason:'ซ้ำ' } }), /TRANSACTION_ALREADY_REVERSED/);
});

test('calendar status update preserves the previous imported snapshot in history and never mutates Ledger', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-12T10:30:00.000Z' });
  const state = createGreenfieldState();
  state.domains.CALENDAR.records.Q1 = { record:{ recordId:'Q1', source:'CALENDAR', type:'PAY_OBLIGATION', status:'OPEN', updatedAt:'2026-08-12T09:00:00.000Z' }, provenance:{ origin:'EVIDENCE_IMPORT', ownerConfirmation:'UNCONFIRMED' } };
  const ledgerBefore = structuredClone(state.domains.LEDGER);
  const next = await runtime.execute(state, { commandId:'C1', idempotencyKey:'K1', domain:'CALENDAR', type:'CALENDAR_SET_STATUS', expectedRevision:1, payload:{ recordId:'Q1', status:'COMPLETED' } });
  assert.equal(next.domains.CALENDAR.records.Q1.record.status, 'COMPLETED');
  assert.equal(next.domains.CALENDAR.records.Q1.history.length, 1);
  assert.equal(next.domains.CALENDAR.records.Q1.history[0].record.status, 'OPEN');
  assert.equal(next.domains.CALENDAR.records.Q1.history[0].provenance.origin, 'EVIDENCE_IMPORT');
  assert.deepEqual(next.domains.LEDGER, ledgerBefore);
});
