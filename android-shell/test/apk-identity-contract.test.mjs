import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const identityUrl = new URL('../apk-identity.json', import.meta.url);
const capacitorUrl = new URL('../capacitor.config.json', import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('APK identity contract pins LIGHTHOUSE package and canonical signer without secrets', async () => {
  const identity = await readJson(identityUrl);

  assert.equal(identity.applicationId, 'com.yggdrasil.lighthouse');
  assert.match(identity.signerCertificateSha256, /^[0-9a-f]{64}$/);
  assert.equal(identity.versionCodePolicy, 'monotonic-increasing-integer');
  assert.equal(identity.identitySchemaVersion, 1);

  const forbidden = /private|passphrase|password|keystoreBytes|privateKey/i;
  for (const key of Object.keys(identity)) {
    assert.doesNotMatch(key, forbidden);
  }
});

test('Capacitor appId cannot drift from canonical APK identity', async () => {
  const [identity, capacitor] = await Promise.all([
    readJson(identityUrl),
    readJson(capacitorUrl),
  ]);

  assert.equal(capacitor.appId, identity.applicationId);
});
