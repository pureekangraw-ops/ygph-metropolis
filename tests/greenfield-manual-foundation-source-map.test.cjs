const test = require('node:test');
const assert = require('node:assert/strict');

async function loadFoundationModules() {
  const [foundation, runtimeModule, domainModule, projections] = await Promise.all([
    import('../manual/foundation.mjs'),
    import('../greenfield/runtime.mjs'),
    import('../greenfield/domain-operations.mjs'),
    import('../greenfield/projections.mjs'),
  ]);
  return { foundation, runtimeModule, domainModule, projections };
}

function createRuntime(runtimeModule) {
  const store = {
    get() { return undefined; },
    put() { return undefined; },
  };
  return runtimeModule.createGreenfieldRuntime({
    store,
    passphrase: 'foundation-source-map-proof',
    lockManager: null,
  });
}

function collectDomainCommands(domainModule) {
  const commands = new Set();
  domainModule.registerGreenfieldDomainCommands({
    register(domain, type) {
      commands.add(`${domain}:${type}`);
    },
  });
  return commands;
}

test('Manual foundation exposes exactly four houses on one Greenfield truth root', async () => {
  const { foundation } = await loadFoundationModules();

  assert.deepEqual(foundation.MANUAL_CORE_IDS, ['INCOME', 'OUTCOME', 'LEDGER', 'CALENDAR']);
  assert.deepEqual(Object.keys(foundation.MANUAL_CORES), foundation.MANUAL_CORE_IDS);

  for (const id of foundation.MANUAL_CORE_IDS) {
    const core = foundation.getManualCore(id);
    assert.equal(core.runtimeRoot, 'GREENFIELD_RUNTIME', `${id} runtime root drifted`);
    assert.equal(core.storageOwner, 'GREENFIELD_VAULT', `${id} storage owner drifted`);
  }

  assert.equal(foundation.getManualCore('LEDGER').manualRole, 'GATEWAY');
  assert.notEqual(foundation.getManualCore('LEDGER').manualRole, 'HEAD');
  assert.equal(foundation.getManualCore('INCOME').truthDomain, 'LEDGER');
  assert.equal(foundation.getManualCore('OUTCOME').truthDomain, 'LEDGER');
  assert.equal(foundation.getManualCore('LEDGER').truthDomain, 'LEDGER');
  assert.equal(foundation.getManualCore('CALENDAR').truthDomain, 'CALENDAR');
});

test('every declared Manual runtime anchor exists on the real Greenfield runtime surface', async () => {
  const { foundation, runtimeModule } = await loadFoundationModules();
  const runtime = createRuntime(runtimeModule);

  try {
    for (const id of foundation.MANUAL_CORE_IDS) {
      const core = foundation.getManualCore(id);
      for (const anchor of core.runtimeAnchors) {
        assert.equal(typeof runtime[anchor], 'function', `${id} runtime anchor missing: ${anchor}`);
      }
    }
  } finally {
    runtime.close();
  }
});

test('every declared Manual domain anchor is registered by the real Greenfield domain owner', async () => {
  const { foundation, domainModule } = await loadFoundationModules();
  const commands = collectDomainCommands(domainModule);

  for (const id of foundation.MANUAL_CORE_IDS) {
    const core = foundation.getManualCore(id);
    for (const anchor of core.domainAnchors) {
      assert.ok(commands.has(`${core.truthDomain}:${anchor}`), `${id} domain anchor missing: ${core.truthDomain}/${anchor}`);
    }
  }
});

test('every declared Manual projection anchor is a real Greenfield projection export', async () => {
  const { foundation, projections } = await loadFoundationModules();

  for (const id of foundation.MANUAL_CORE_IDS) {
    const core = foundation.getManualCore(id);
    for (const anchor of core.projectionAnchors) {
      assert.equal(typeof projections[anchor], 'function', `${id} projection anchor missing: ${anchor}`);
    }
  }
});
