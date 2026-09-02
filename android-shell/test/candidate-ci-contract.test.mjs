import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMemoryPatchStore } from '../www/patch/patch-store.mjs';

const workflowUrl = new URL('../../.github/workflows/lighthouse-apk-debug.yml', import.meta.url);
const workflowText = () => readFile(workflowUrl, 'utf8');

function baseSnapshot() {
  return {
    version: '0.0.1',
    assets: {
      'ui.html': '<main>base</main>',
      'ui.css': 'main { display: block; }',
      'logic.mjs': 'export async function mount() {}',
      'rules.json': '{"mode":"base"}',
      'vocabulary.json': '{"hello":"สวัสดี"}',
    },
  };
}

test('candidate APK pipeline verifies final bytes before immutable publication and keeps activation locked', async () => {
  const text = await workflowText();
  const securityApply = text.indexOf('Apply generated Android security baseline');
  const securityVerify = text.indexOf('Verify generated Android security');
  const identityVerify = text.indexOf('Verify final APK identity');
  const publishCandidate = text.indexOf('Publish immutable candidate assets');
  const rawVerify = text.indexOf('Verify immutable Raw APK');
  const activationLock = text.indexOf('Confirm activation remains locked');
  const ownerArtifact = text.indexOf('Upload owner-test APK');

  assert.ok(securityApply >= 0, 'missing security application');
  assert.ok(securityVerify > securityApply, 'security verification must follow application');
  assert.ok(identityVerify > securityVerify, 'final APK identity must follow security verification');
  assert.ok(publishCandidate > identityVerify, 'immutable candidate publication must follow final identity verification');
  assert.ok(rawVerify > publishCandidate, 'download-back hash verification must follow immutable publication');
  assert.ok(activationLock > rawVerify, 'activation lock must be checked after download-back verification');
  assert.ok(ownerArtifact > activationLock, 'owner-test APK artifact must be downstream of the locked candidate gate');
  assert.match(text, /release\/lighthouse-update\.json is intentionally unchanged until real-device acceptance/u);
  assert.doesNotMatch(text, /name:\s*Publish update manifest/u);
  assert.doesNotMatch(text, /git add[^\n]*lighthouse-update\.json/u);
});

test('candidate APK signing uses APK trust domain only and binds evidence to source head', async () => {
  const text = await workflowText();
  for (const name of [
    'LIGHTHOUSE_APK_KEYSTORE_BASE64',
    'LIGHTHOUSE_APK_STORE_PASSWORD',
    'LIGHTHOUSE_APK_KEY_ALIAS',
    'LIGHTHOUSE_APK_KEY_PASSWORD',
  ]) assert.match(text, new RegExp(name));

  assert.doesNotMatch(text, /LIGHTHOUSE_PATCH_PRIVATE_KEY_PEM|LIGHTHOUSE_PATCH_KEY_PASSPHRASE/u);
  assert.match(text, /APK_SOURCE_COMMIT/u);
  assert.match(text, /github\.event\.pull_request\.head\.sha/u);
  assert.match(text, /verify-apk-identity\.mjs/u);
  assert.match(text, /apksigner/u);
});

test('existing full-app package proof is downstream of staging', async () => {
  const text = await workflowText();
  const stage = text.indexOf('Stage existing repository application');
  const packageProof = text.indexOf('Prove Android package is existing app, not replacement UI');
  assert.ok(stage >= 0, 'missing full-app staging');
  assert.ok(packageProof > stage, 'full-app package proof must run after staging');
});

test('patch metadata contract carries version and snapshot pointers without changing the active version', async () => {
  const base = baseSnapshot();
  const store = createMemoryPatchStore({ baseSnapshot: base });
  assert.deepEqual(await store.readMeta(), {
    currentVersion: '0.0.1',
    previousVersion: null,
    currentSnapshotId: null,
    previousSnapshotId: null,
  });
  assert.deepEqual(await store.readCurrent(), base);
});
