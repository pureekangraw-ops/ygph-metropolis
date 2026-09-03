import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const identity = JSON.parse(await readFile(new URL('../apk-identity.json', import.meta.url), 'utf8'));
const capacitor = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
test('APK identity pins LIGHTHOUSE package and canonical signer', () => {
  assert.equal(identity.applicationId, 'com.yggdrasil.lighthouse');
  assert.match(identity.signerCertificateSha256, /^[0-9a-f]{64}$/);
  assert.equal(capacitor.appId, identity.applicationId);
});
