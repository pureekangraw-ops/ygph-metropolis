import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, root), 'utf8'));

test('APK trust anchor is rotated to owner-authorized lighthouse-debug-patch-2 public key only', async () => {
  const trustedKey = await readJson('www/patch/trusted-key.json');

  assert.equal(trustedKey.keyId, 'lighthouse-debug-patch-2');
  assert.equal(trustedKey.alg, 'ECDSA-P256-SHA256');
  assert.equal(trustedKey.jwk.kty, 'EC');
  assert.equal(trustedKey.jwk.crv, 'P-256');
  assert.equal(trustedKey.jwk.x, 'RusBRQN5tqxVlKcFBc2ILvcPDrHZX_sONU-ZuG-482w');
  assert.equal(trustedKey.jwk.y, 'T5ydXpR4kgP5_KQxwGAmdtM9oXN9uWoOwtSGIiA9uew');
  assert.equal('d' in trustedKey.jwk, false, 'repository trust anchor must contain public material only');
});
