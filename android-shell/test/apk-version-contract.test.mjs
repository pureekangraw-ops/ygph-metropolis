import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const versionUrl = new URL('../version.json', import.meta.url);

async function readVersion() {
  return JSON.parse(await readFile(versionUrl, 'utf8'));
}

test('Android APK version file is the monotonic owner-build source of truth', async () => {
  const version = await readVersion();
  assert.equal(version.owner, 'ANDROID_APK');
  assert.equal(Number.isInteger(version.baselineVersionCode), true);
  assert.equal(Number.isInteger(version.versionCode), true);
  assert.equal(version.versionCode, version.baselineVersionCode + 1);
  assert.match(version.versionName, /^1\.0\.0-owner\.\d+$/);
  assert.equal(version.patchVersionDerived, false);
});

test('candidate versionCode must be greater than its declared installed baseline', async () => {
  const version = await readVersion();
  const { assertUpgradeVersion } = await import('../tools/set-android-version.mjs');

  assert.doesNotThrow(() => assertUpgradeVersion({
    baselineVersionCode:version.baselineVersionCode,
    candidateVersionCode:version.versionCode,
  }));
  assert.throws(() => assertUpgradeVersion({
    baselineVersionCode:version.versionCode,
    candidateVersionCode:version.versionCode,
  }), /APK_VERSION_NOT_MONOTONIC/);
  assert.throws(() => assertUpgradeVersion({
    baselineVersionCode:version.versionCode + 1,
    candidateVersionCode:version.versionCode,
  }), /APK_VERSION_NOT_MONOTONIC/);
});
