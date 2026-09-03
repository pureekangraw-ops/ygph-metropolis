import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, root), 'utf8'));

test('APK trust anchor is rotated to owner-authorized lighthouse-debug-patch-3 public key only', async () => {
  const trustedKey = await readJson('www/patch/trusted-key.json');
  const signer = await readFile(new URL('tools/sign-patch.mjs', root), 'utf8');

  assert.equal(trustedKey.keyId, 'lighthouse-debug-patch-3');
  assert.equal(trustedKey.alg, 'ECDSA-P256-SHA256');
  assert.equal(trustedKey.jwk.kty, 'EC');
  assert.equal(trustedKey.jwk.crv, 'P-256');
  assert.equal(trustedKey.jwk.x, 'FMkr-DB3LgnluzecC6qqyEGUqoVNZgmiXPDgRM6Fahk');
  assert.equal(trustedKey.jwk.y, '3dJJRoGWzM6G0ENqHxaRwN1Oh6HEGzwb8MXUOA78ygw');
  assert.equal('d' in trustedKey.jwk, false, 'repository trust anchor must contain public material only');
  assert.match(signer, /DEFAULT_KEY_ID = 'lighthouse-debug-patch-3'/u);
});
