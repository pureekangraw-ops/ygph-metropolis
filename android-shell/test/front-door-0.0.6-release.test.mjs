import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCurrentPatchSources } from '../tools/build-current-patch-source.mjs';

const root = new URL('../', import.meta.url);

test('0.0.6 is a bounded test Patch from 0.0.5 with no capability change', async () => {
  const { contract, primary, bootstrap } = await buildCurrentPatchSources();
  assert.equal(contract.version, '0.0.6');
  assert.equal(contract.primaryBaseVersion, '0.0.5');
  assert.equal(contract.bootstrapBaseVersion, '0.0.1');
  assert.equal(contract.releaseDirectory, 'release/front-door-0.0.6');
  assert.equal(primary.baseVersion, '0.0.5');
  assert.equal(primary.version, '0.0.6');
  assert.equal(bootstrap.version, '0.0.6');

  const priorUi = await readFile(new URL('release/front-door-0.0.5/ui.html', root), 'utf8');
  const priorLogic = await readFile(new URL('release/front-door-0.0.5/logic.mjs', root), 'utf8');
  assert.equal(primary.files['ui.html'], priorUi);
  assert.equal(primary.files['logic.mjs'], priorLogic);
});
