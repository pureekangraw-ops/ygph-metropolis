import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../tools/build-current-patch-source.mjs', import.meta.url);

async function loadBuilder() {
  try {
    return await import(moduleUrl.href);
  } catch (error) {
    assert.fail(`standard current Patch builder is required: ${error?.code ?? error?.message ?? error}`);
  }
}

test('current Patch contract owns version and base versions in one source-controlled place', async () => {
  const { loadCurrentPatchContract } = await loadBuilder();
  const contract = await loadCurrentPatchContract();
  assert.match(contract.version, /^\d+\.\d+\.\d+$/);
  assert.match(contract.primaryBaseVersion, /^\d+\.\d+\.\d+$/);
  assert.match(contract.bootstrapBaseVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(contract.releaseDirectory, `release/front-door-${contract.version}`);
});

test('generic current Patch builder emits the canonical app bundle for primary and bootstrap', async () => {
  const { buildCurrentPatchSources } = await loadBuilder();
  const { contract, primary, bootstrap } = await buildCurrentPatchSources();
  assert.equal(primary.version, contract.version);
  assert.equal(primary.baseVersion, contract.primaryBaseVersion);
  assert.equal(bootstrap.version, contract.version);
  assert.equal(bootstrap.baseVersion, contract.bootstrapBaseVersion);
  for (const path of ['app/ui.html','app/ui.css','app/logic.mjs','app/rules.json','app/vocabulary.json']) {
    assert.equal(typeof primary.files[path], 'string', `primary must include ${path}`);
    assert.equal(typeof bootstrap.files[path], 'string', `bootstrap must include ${path}`);
  }
  assert.equal(primary.files['ui.html'], undefined);
  assert.equal(primary.files['logic.mjs'], undefined);
});

test('current Patch contract fails closed on unsafe release directory traversal', async () => {
  const { validateCurrentPatchContract } = await loadBuilder();
  assert.throws(() => validateCurrentPatchContract({
    version: '0.0.6',
    primaryBaseVersion: '0.0.5',
    bootstrapBaseVersion: '0.0.1',
    releaseDirectory: '../outside',
  }), /CURRENT_PATCH_RELEASE_DIRECTORY_INVALID/);
});
