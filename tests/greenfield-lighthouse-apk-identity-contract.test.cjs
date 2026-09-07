const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const versionPath = path.join(ROOT, 'android-shell', 'version.json');
const identityPath = path.join(ROOT, 'android-shell', 'apk-identity.json');
const verifierPath = path.join(ROOT, 'android-shell', 'tools', 'verify-apk-identity.mjs');
const versionToolPath = path.join(ROOT, 'android-shell', 'tools', 'set-android-version.mjs');

test('Android candidate records and enforces the canonical upgrade baseline', async () => {
  const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  assert.equal(version.baselineVersionCode, 1005);
  assert.equal(version.versionCode, 1006);
  assert.ok(version.versionCode > version.baselineVersionCode);

  const source = fs.readFileSync(versionToolPath, 'utf8');
  assert.match(source, /assertUpgradeVersion\(\{\s*baselineVersionCode:\s*version\.baselineVersionCode,\s*candidateVersionCode:\s*version\.versionCode\s*\}\)/s);
});

test('APK identity verifier fails closed on package signer and version drift', async () => {
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  assert.equal(identity.applicationId, 'com.yggdrasil.lighthouse');
  assert.equal(identity.signerCertificateSha256, 'aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce');

  const { assertApkIdentity } = await import(pathToFileURL(verifierPath));
  const expected = {
    applicationId: identity.applicationId,
    signerCertificateSha256: identity.signerCertificateSha256,
    versionCode: 1006,
    versionName: '1.0.0-owner.1',
  };
  assert.doesNotThrow(() => assertApkIdentity(expected, expected));
  assert.throws(() => assertApkIdentity({ ...expected, applicationId: 'bad.id' }, expected), /APK_APPLICATION_ID_MISMATCH/);
  assert.throws(() => assertApkIdentity({ ...expected, signerCertificateSha256: '0'.repeat(64) }, expected), /APK_SIGNER_MISMATCH/);
  assert.throws(() => assertApkIdentity({ ...expected, versionCode: 1005 }, expected), /APK_VERSION_CODE_MISMATCH/);
});

test('final APK verifier owns hash and provenance evidence after signed-byte verification', () => {
  const source = fs.readFileSync(verifierPath, 'utf8');
  assert.match(source, /apkSha256:\s*sha256\(apkBytes\)/);
  assert.match(source, /sourceCommit/);
  assert.match(source, /workflowRunId/);
  assert.match(source, /apksigner[^\n]*verify/s);
});
