"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('command runtime applies one named domain command and increments revision once', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const runtime = createCommandRuntime();
  runtime.register('STORE', 'STORE_ADD_RECORD', ({ state, payload }) => { state.domains.STORE.records[payload.recordId] = { record: { recordId: payload.recordId }, provenance: { origin: 'LIVE_COMMAND' } }; });
  const next = await runtime.execute(createGreenfieldState(), { commandId: 'C1', idempotencyKey: 'K1', domain: 'STORE', type: 'STORE_ADD_RECORD', expectedRevision: 1, payload: { recordId: 'S1' } });
  assert.equal(next.revision, 2);
  assert.equal(next.domains.STORE.records.S1.record.recordId, 'S1');
  assert.equal(next.commandLog.K1.commandId, 'C1');
});

test('command runtime rejects stale revision duplicate key and cross-domain registration', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const runtime = createCommandRuntime(); runtime.register('LEDGER', 'LEDGER_NOOP', () => {});
  const state = createGreenfieldState();
  await assert.rejects(runtime.execute(state, { commandId: 'C1', idempotencyKey: 'K1', domain: 'LEDGER', type: 'LEDGER_NOOP', expectedRevision: 2, payload: {} }), /STALE_COMMAND/);
  const next = await runtime.execute(state, { commandId: 'C2', idempotencyKey: 'K2', domain: 'LEDGER', type: 'LEDGER_NOOP', expectedRevision: 1, payload: {} });
  await assert.rejects(runtime.execute(next, { commandId: 'C3', idempotencyKey: 'K2', domain: 'LEDGER', type: 'LEDGER_NOOP', expectedRevision: 2, payload: {} }), /DUPLICATE_COMMAND/);
  assert.throws(() => runtime.register('STORE', 'LEDGER_BAD', () => {}), /COMMAND_DOMAIN_MISMATCH/);
});
