import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyPatchBundle } from '../www/patch/patch-contract.mjs';

const root = new URL('../', import.meta.url);
const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, root), 'utf8'));

test('project verifier accepts integrated Front Door 0.0.3 signed by lighthouse-debug-patch-2', async () => {
  const trustedKey = await readJson('www/patch/trusted-key.json');
  const patch = await readJson('test/fixtures/front-door-0.0.3-key2.lhpatch');

  assert.equal(trustedKey.keyId, 'lighthouse-debug-patch-2');
  assert.equal(patch.signature.keyId, 'lighthouse-debug-patch-2');
  const verified = await verifyPatchBundle(patch, {
    currentVersion: '0.0.1',
    trustedKey,
  });

  assert.equal(verified.version, '0.0.3');
  assert.deepEqual(Object.keys(verified.files).sort(), ['logic.mjs', 'ui.css', 'ui.html']);
  assert.match(verified.files['logic.mjs'].content, /requestExecution\(/u);
  assert.match(verified.files['ui.html'].content, /data-chat-form/u);
});
