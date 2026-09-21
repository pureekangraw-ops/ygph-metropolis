import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MAPLIBRE_ANDROID_DEPENDENCY,
  MAPLIBRE_ANDROID_VERSION,
  applyLocalMapNativeProof,
  debugProofManifest,
  patchGradleForLocalMapProof,
  patchManifestForLocalMapProof,
} from '../tools/apply-local-map-native-proof.mjs';
import { createLocalMapProofFixture } from '../tools/create-local-map-proof-fixture.mjs';

const GRADLE = `android {
  namespace "com.yggdrasil.lighthouse"
}
dependencies {
  implementation project(':capacitor-android')
}
`;

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:theme="@style/AppTheme">
    <activity android:name=".MainActivity" android:exported="true" />
  </application>
</manifest>
`;

test('native proof pins MapLibre Android with PMTiles-capable version', () => {
  assert.equal(MAPLIBRE_ANDROID_VERSION, '13.6.1');
  const patched = patchGradleForLocalMapProof(GRADLE);
  assert.match(patched, /org\.maplibre\.gl:android-sdk:13\.6\.1/);
  assert.equal(patched.split(MAPLIBRE_ANDROID_DEPENDENCY).length - 1, 1);
  assert.equal(patchGradleForLocalMapProof(patched), patched);
});

test('release manifest strips unused MapLibre permissions and contains no proof activity', () => {
  const patched = patchManifestForLocalMapProof(MANIFEST);
  assert.match(patched, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  assert.doesNotMatch(patched, /LocalPmtilesProofActivity/);
  for (const permission of [
    'ACCESS_NETWORK_STATE',
    'ACCESS_WIFI_STATE',
    'ACCESS_COARSE_LOCATION',
    'ACCESS_FINE_LOCATION',
  ]) {
    assert.match(patched, new RegExp(`android\\.permission\\.${permission}[^>]+tools:node="remove"`));
  }
});

test('proof activity is exported only from debug source set', () => {
  const manifest = debugProofManifest();
  assert.match(manifest, /LocalPmtilesProofActivity/);
  assert.match(manifest, /android:exported="true"/);
});

test('overlay materializes debug-only proof surface without mutating Ride truth', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lighthouse-local-map-native-'));
  const android = join(root, 'android');
  const app = join(android, 'app');
  await mkdir(join(app, 'src', 'main'), { recursive: true });
  await writeFile(join(app, 'build.gradle'), GRADLE);
  await writeFile(join(app, 'src', 'main', 'AndroidManifest.xml'), MANIFEST);

  const result = await applyLocalMapNativeProof(android);
  const activity = await readFile(result.activityPath, 'utf8');
  const releaseManifest = await readFile(result.manifestPath, 'utf8');
  const debugManifest = await readFile(result.debugManifestPath, 'utf8');
  assert.match(activity, /pmtiles:\/\/file:\/\//);
  assert.match(activity, /getAssets\(\)\.open\(PROOF_ASSET\)/);
  assert.match(activity, /PACKAGE_STAGED source=debug_asset managed=true/);
  assert.match(activity, /RasterSource/);
  assert.match(activity, /RENDER_COMPLETE local=true networkFallback=false/);
  assert.doesNotMatch(activity, /ACCESS_(?:COARSE|FINE|BACKGROUND)_LOCATION/);
  assert.doesNotMatch(releaseManifest, /LocalPmtilesProofActivity/);
  assert.match(debugManifest, /android:exported="true"/);
});

test('proof fixture is a deterministic local PMTiles v3 archive with magenta raster tile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lighthouse-pmtiles-fixture-'));
  const output = join(root, 'gate1-proof.pmtiles');
  const evidence = await createLocalMapProofFixture(output);
  const bytes = await readFile(output);
  assert.equal(bytes.subarray(0, 7).toString('ascii'), 'PMTiles');
  assert.equal(bytes[7], 3);
  assert.ok(evidence.byteLength > 127);
  assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.expectedPixel, { r: 255, g: 0, b: 255 });
});
