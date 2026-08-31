import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../../.github/workflows/lighthouse-apk-debug.yml', import.meta.url);

async function workflowText() {
  return readFile(workflowUrl, 'utf8');
}

test('APK distributable signing uses APK-specific secrets only', async () => {
  const text = await workflowText();
  for (const name of [
    'LIGHTHOUSE_APK_KEYSTORE_BASE64',
    'LIGHTHOUSE_APK_STORE_PASSWORD',
    'LIGHTHOUSE_APK_KEY_ALIAS',
    'LIGHTHOUSE_APK_KEY_PASSWORD',
  ]) {
    assert.match(text, new RegExp(name));
  }
  assert.match(text, /assembleRelease|android:release/);
  assert.match(text, /apksigner/);
  assert.match(text, /verify-apk-identity\.mjs/);
  assert.match(text, /set-android-version\.mjs/);
});

test('Patch and APK signing trust domains stay isolated', async () => {
  const text = await workflowText();
  const patchBlock = text.slice(text.indexOf('Sign verify and manifest Front Door 0.0.5 with key-3'), text.indexOf('Upload verified Front Door 0.0.5 signed Patches'));
  assert.match(patchBlock, /LIGHTHOUSE_PATCH_PRIVATE_KEY_PEM/);
  assert.match(patchBlock, /LIGHTHOUSE_PATCH_KEY_PASSPHRASE/);
  assert.doesNotMatch(patchBlock, /LIGHTHOUSE_APK_/);

  const apkStart = text.indexOf('Materialize canonical APK signer');
  assert.notEqual(apkStart, -1);
  const apkBlock = text.slice(apkStart);
  assert.doesNotMatch(apkBlock, /LIGHTHOUSE_PATCH_PRIVATE_KEY_PEM|LIGHTHOUSE_PATCH_KEY_PASSPHRASE/);
});

test('APK publication is downstream of final-byte identity verification', async () => {
  const text = await workflowText();
  const verifyIndex = text.indexOf('Verify final APK identity');
  const uploadIndex = text.indexOf('Upload canonical APK');
  assert.ok(verifyIndex >= 0, 'missing final APK verification step');
  assert.ok(uploadIndex > verifyIndex, 'APK upload must happen after identity verification');
});

test('identity evidence binds to the PR head source commit instead of the synthetic PR merge SHA', async () => {
  const text = await workflowText();
  assert.match(text, /APK_SOURCE_COMMIT/);
  assert.match(text, /github\.event\.pull_request\.head\.sha/);
  const verifyStart = text.indexOf('Verify final APK identity');
  const verifyBlock = text.slice(verifyStart, text.indexOf('Upload canonical APK'));
  assert.match(verifyBlock, /APK_SOURCE_COMMIT/);
});