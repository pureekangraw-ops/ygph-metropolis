"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('greenfield state contains STORE LEDGER CALENDAR only and no RIDE domain', async () => {
  const { createGreenfieldState, validateGreenfieldState } = await import('../greenfield/core.mjs');
  const state = createGreenfieldState({ now: '2026-08-12T10:00:00.000Z' });
  assert.equal(state.schema, 1);
  assert.equal(state.revision, 1);
  assert.deepEqual(Object.keys(state.domains).sort(), ['CALENDAR', 'LEDGER', 'STORE']);
  assert.equal('RIDE' in state.domains, false);
  assert.equal(validateGreenfieldState(state).ok, true);
});

test('greenfield validation rejects unexpected domains', async () => {
  const { createGreenfieldState, validateGreenfieldState } = await import('../greenfield/core.mjs');
  const state = createGreenfieldState();
  state.domains.RIDE = { records: {} };
  const result = validateGreenfieldState(state);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /UNEXPECTED_DOMAIN:RIDE/);
});
