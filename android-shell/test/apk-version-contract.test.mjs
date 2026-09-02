import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertUpgradeVersion } from '../tools/set-android-version.mjs';
const version = JSON.parse(await readFile(new URL('../version.json', import.meta.url), 'utf8'));
test('Android version is LIGHTHOUSE 2.0.1 and monotonic from 2.0.0', () => {
  assert.equal(version.versionName, '2.0.1');
  assert.equal(version.versionCode, 2001);
  assert.equal(version.owner, 'ANDROID_APK');
  assert.equal(version.patchVersionDerived, false);
  assert.doesNotThrow(() => assertUpgradeVersion({ baselineVersionCode:2000, candidateVersionCode:version.versionCode }));
});
