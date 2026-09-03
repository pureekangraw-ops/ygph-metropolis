import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyPatchBundle } from '../www/patch/patch-contract.mjs';

const root = new URL('../', import.meta.url);
const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, root), 'utf8'));

test('key-2 signed Front Door 0.0.3 remains historical evidence but is rejected by current key-3 APK', async () => {
  const trustedKey = await readJson('www/patch/trusted-key.json');
  const patch = await readJson('test/fixtures/front-door-0.0.3-key2.lhpatch');

  assert.equal(trustedKey.keyId, 'lighthouse-debug-patch-3');
  assert.equal(patch.signature.keyId, 'lighthouse-debug-patch-2');
  await assert.rejects(() => verifyPatchBundle(patch, {
    currentVersion:'0.0.1',
    trustedKey,
  }));
});
