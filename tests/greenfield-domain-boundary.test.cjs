"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('domain handlers receive only their own domain slice, not whole mutable state', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const runtime = createCommandRuntime();
  runtime.register('STORE', 'STORE_ADD_RECORD', context => {
    assert.equal(context.state, undefined);
    assert.ok(context.domainState);
    context.domainState.records.S1 = { record: { recordId: 'S1' }, provenance: { origin: 'LIVE_COMMAND' } };
  });
  const before = createGreenfieldState();
  const next = await runtime.execute(before, { commandId: 'C1', idempotencyKey: 'K1', domain: 'STORE', type: 'STORE_ADD_RECORD', expectedRevision: 1, payload: {} });
  assert.equal(next.domains.STORE.records.S1.record.recordId, 'S1');
  assert.deepEqual(next.domains.LEDGER, before.domains.LEDGER);
  assert.deepEqual(next.domains.CALENDAR, before.domains.CALENDAR);
});
