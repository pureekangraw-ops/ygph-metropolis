"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function assertAnchorPresent(source, anchor, label) {
  assert.equal(
    source.includes(anchor),
    true,
    `${label} anchor is not backed by current source: ${anchor}`,
  );
}

test('Manual foundation is four evidence-backed houses on one Runtime/Vault truth root', async () => {
  const { MANUAL_CORE_IDS, MANUAL_CORES } = await import('../manual/foundation.mjs');
  const runtimeSource = readRepoFile('greenfield/runtime.mjs');
  const domainSource = readRepoFile('greenfield/domain-operations.mjs');
  const projectionSource = readRepoFile('greenfield/projections.mjs');

  assert.deepEqual(MANUAL_CORE_IDS, ['INCOME', 'OUTCOME', 'LEDGER', 'CALENDAR']);

  for (const id of MANUAL_CORE_IDS) {
    const core = MANUAL_CORES[id];
    assert.ok(core, `missing Manual Core: ${id}`);
    assert.equal(core.runtimeRoot, 'GREENFIELD_RUNTIME');
    assert.equal(core.storageOwner, 'GREENFIELD_VAULT');

    for (const anchor of core.runtimeAnchors) assertAnchorPresent(runtimeSource, anchor, `${id} runtime`);
    for (const anchor of core.domainAnchors) assertAnchorPresent(domainSource, anchor, `${id} domain`);
    for (const anchor of core.projectionAnchors) assertAnchorPresent(projectionSource, anchor, `${id} projection`);
  }
});

test('Ledger foundation role is command gateway, not business-logic head', async () => {
  const { MANUAL_CORES } = await import('../manual/foundation.mjs');
  assert.equal(MANUAL_CORES.LEDGER.manualRole, 'GATEWAY');
  assert.notEqual(MANUAL_CORES.LEDGER.manualRole, 'HEAD');
});
