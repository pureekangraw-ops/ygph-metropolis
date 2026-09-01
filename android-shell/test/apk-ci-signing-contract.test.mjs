import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../../.github/workflows/lighthouse-apk-debug.yml', import.meta.url);
const builderUrl = new URL('../tools/build-current-patch-source.mjs', import.meta.url);

async function workflowText() {
  return readFile(workflowUrl, 'utf8');
}

test('standard APK flow delegates current Patch ownership instead of hard-coding a release number', async () => {
  const text = await workflowText();
  const builder = await readFile(builderUrl, 'utf8');
  assert.match(text, /build-current-patch-source\.mjs/);
  assert.match(builder, /release\/current-patch\.json/);
  assert.doesNotMatch(text, /build-front-door-0\.0\.5-source\.mjs|build-front-door-0\.0\.5-bootstrap-source\.mjs/);
  assert.doesNotMatch(text, /front-door-0\.0\.5|0\.0\.5-signing|0\.0\.5-signed/);
});

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
  const patchStart = text.indexOf('Sign verify and manifest current Patch');
  const patchEnd = text.indexOf('Upload verified current Patch');
  assert.notEqual(patchStart, -1, 'missing standard Patch signing step');
  assert.ok(patchEnd > patchStart, 'missing standard Patch artifact step');
  const patchBlock = text.slice(patchStart, patchEnd);
  assert.match(patchBlock, /LIGHTHOUSE_PATCH_PRIVATE_KEY_PEM/);
  assert.match(patchBlock, /LIGHTHOUSE_PATCH_KEY_PASSPHRASE/);
  assert.doesNotMatch(patchBlock, /LIGHTHOUSE_APK_/);

  const apkStart = text.indexOf('Materialize canonical APK signer');
  assert.notEqual(apkStart, -1);
  const apkBlock = text.slice(apkStart);
  assert.doesNotMatch(apkBlock, /LIGHTHOUSE_PATCH_PRIVATE_KEY_PEM|LIGHTHOUSE_PATCH_KEY_PASSPHRASE/);
});

test('APK publication is downstream of generated security and final-byte identity verification', async () => {
  const text = await workflowText();
  const securityApplyIndex = text.indexOf('Apply generated Android security baseline');
  const securityVerifyIndex = text.indexOf('Verify generated Android security');
  const verifyIndex = text.indexOf('Verify final APK identity');
  const uploadIndex = text.indexOf('Upload canonical APK');
  assert.ok(securityApplyIndex >= 0, 'missing generated security application step');
  assert.ok(securityVerifyIndex > securityApplyIndex, 'security verification must follow application');
  assert.ok(verifyIndex > securityVerifyIndex, 'final APK verification must follow generated security verification');
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
