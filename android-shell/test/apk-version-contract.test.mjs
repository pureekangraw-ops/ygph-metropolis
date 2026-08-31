import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const versionUrl = new URL('../version.json', import.meta.url);

async function readVersion() {
  return JSON.parse(await readFile(versionUrl, 'utf8'));
}

test('Android APK version has one explicit source of truth', async () => {
  const version = await readVersion();
  assert.ok(Number.isInteger(version.versionCode));
  assert.ok(version.versionCode > 0);
  assert.match(version.versionName, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
});

test('Android APK version is explicitly independent from Patch version', async () => {
  const version = await readVersion();
  assert.equal(version.owner, 'ANDROID_APK');
  assert.equal(version.patchVersionDerived, false);
});

test('candidate versionCode must be greater than baseline versionCode', async () => {
  const { assertUpgradeVersion } = await import('../tools/set-android-version.mjs');
  assert.doesNotThrow(() => assertUpgradeVersion({ baselineVersionCode: 1, candidateVersionCode: 2 }));
  assert.throws(() => assertUpgradeVersion({ baselineVersionCode: 2, candidateVersionCode: 2 }), /APK_VERSION_NOT_MONOTONIC/);
  assert.throws(() => assertUpgradeVersion({ baselineVersionCode: 3, candidateVersionCode: 2 }), /APK_VERSION_NOT_MONOTONIC/);
});
