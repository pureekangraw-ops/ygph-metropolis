"use strict";
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('Manual foundation establishes exactly four homes on the existing Greenfield truth root', async () => {
  const { MANUAL_CORE_IDS, MANUAL_CORES, getManualCore } = await import('../manual/foundation.mjs');

  assert.deepEqual(MANUAL_CORE_IDS, ['INCOME', 'OUTCOME', 'LEDGER', 'CALENDAR']);
  assert.equal(Object.keys(MANUAL_CORES).length, 4);
  assert.equal(new Set(Object.values(MANUAL_CORES).map(core => core.id)).size, 4);

  for (const id of MANUAL_CORE_IDS) {
    const core = getManualCore(id);
    assert.equal(core.id, id);
    assert.equal(core.runtimeRoot, 'GREENFIELD_RUNTIME');
    assert.equal(core.storageOwner, 'GREENFIELD_VAULT');
    assert.ok(Object.isFrozen(core));
  }

  assert.equal(getManualCore('LEDGER').manualRole, 'GATEWAY');
  assert.notEqual(getManualCore('LEDGER').manualRole, 'HEAD');
  assert.equal(getManualCore('LEDGER').truthDomain, 'LEDGER');
  assert.equal(getManualCore('CALENDAR').truthDomain, 'CALENDAR');
  assert.equal(getManualCore('INCOME').truthDomain, 'LEDGER');
  assert.equal(getManualCore('OUTCOME').truthDomain, 'LEDGER');
  assert.throws(() => getManualCore('UNKNOWN'), /MANUAL_CORE_UNKNOWN:UNKNOWN/);
});

test('Manual homes point at proven runtime and projection anchors without inventing a second engine', async () => {
  const { getManualCore } = await import('../manual/foundation.mjs');
  const runtime = fs.readFileSync('greenfield/runtime.mjs', 'utf8');
  const projections = fs.readFileSync('greenfield/projections.mjs', 'utf8');

  for (const method of getManualCore('INCOME').runtimeAnchors) assert.match(runtime, new RegExp(`\\b${method}\\b`));
  for (const method of getManualCore('OUTCOME').runtimeAnchors) assert.match(runtime, new RegExp(`\\b${method}\\b`));
  for (const method of getManualCore('LEDGER').runtimeAnchors) assert.match(runtime, new RegExp(`\\b${method}\\b`));
  for (const method of getManualCore('CALENDAR').runtimeAnchors) assert.match(runtime, new RegExp(`\\b${method}\\b`));

  for (const projection of getManualCore('LEDGER').projectionAnchors) assert.match(projections, new RegExp(`\\b${projection}\\b`));
  for (const projection of getManualCore('CALENDAR').projectionAnchors) assert.match(projections, new RegExp(`\\b${projection}\\b`));
});

test('Phase 1 Manual foundation stays isolated from Intent, Chat, UI, and persistence ownership', async () => {
  const { MANUAL_CORES } = await import('../manual/foundation.mjs');
  for (const core of Object.values(MANUAL_CORES)) {
    assert.equal('intent' in core, false);
    assert.equal('execute' in core, false);
    assert.equal('store' in core, false);
  }
});
