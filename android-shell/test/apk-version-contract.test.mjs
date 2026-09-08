import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const versionUrl = new URL('../version.json', import.meta.url);

async function readVersion() {
  return JSON.parse(await readFile(versionUrl, 'utf8'));
}

test('Android APK version has the owner-test source of truth', async () => {
  const version = await readVersion();
  assert.equal(version.versionCode, 1006);
  assert.equal(version.versionName, '1.0.0-owner.1');
  assert.equal(version.owner, 'ANDROID_APK');
  assert.equal(version.patchVersionDerived, false);
});

test('candidate versionCode must be greater than canonical donor baseline', async () => {
  const { assertUpgradeVersion } = await import('../tools/set-android-version.mjs');
  assert.doesNotThrow(() => assertUpgradeVersion({ baselineVersionCode: 1005, candidateVersionCode: 1006 }));
  assert.throws(() => assertUpgradeVersion({ baselineVersionCode: 1006, candidateVersionCode: 1006 }), /APK_VERSION_NOT_MONOTONIC/);
  assert.throws(() => assertUpgradeVersion({ baselineVersionCode: 1007, candidateVersionCode: 1006 }), /APK_VERSION_NOT_MONOTONIC/);
});
