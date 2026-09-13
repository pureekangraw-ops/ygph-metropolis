const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadModule() {
  const target = path.resolve(__dirname, '../lighthouse-next/update/package-policy.mjs');
  return import(pathToFileURL(target).href);
}

test('data and module packages accept only explicit replaceable scopes', async () => {
  const { assertPackageScopeAllowed } = await loadModule();
  assert.deepEqual(assertPackageScopeAllowed({ packageType: 'data', requestedScopes: ['lighthouse-next/assets'] }), ['lighthouse-next/assets']);
  assert.deepEqual(assertPackageScopeAllowed({ packageType: 'module', requestedScopes: ['lighthouse-next/view-model.mjs'] }), ['lighthouse-next/view-model.mjs']);
  assert.deepEqual(assertPackageScopeAllowed({ packageType: 'full', requestedScopes: ['full-app'] }), ['full-app']);
});

test('ordinary packages cannot modify Critical Core', async () => {
  const { assertPackageScopeAllowed, CRITICAL_CORE_SCOPES } = await loadModule();
  for (const scope of CRITICAL_CORE_SCOPES) {
    assert.throws(() => assertPackageScopeAllowed({ packageType: 'data', requestedScopes: [scope] }), /scope/i);
    assert.throws(() => assertPackageScopeAllowed({ packageType: 'module', requestedScopes: [scope] }), /scope/i);
  }
});

test('unknown scope and wildcard requests fail closed', async () => {
  const { assertPackageScopeAllowed } = await loadModule();
  assert.throws(() => assertPackageScopeAllowed({ packageType: 'module', requestedScopes: ['*'] }), /scope/i);
  assert.throws(() => assertPackageScopeAllowed({ packageType: 'data', requestedScopes: ['unknown'] }), /scope/i);
  assert.throws(() => assertPackageScopeAllowed({ packageType: 'full', requestedScopes: ['lighthouse-next/app.mjs'] }), /scope/i);
});
