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
  patchMainActivityForRideMapPlugin,
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

const MAIN_ACTIVITY = `package com.yggdrasil.lighthouse;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
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
  assert.match(patched, /android:name=".RideMapActivity"/);
  assert.match(patched, /RideMapActivity"[\s\S]*android:exported="false"/);
  assert.doesNotMatch(patched, /android\.permission\.ACCESS_NETWORK_STATE[^>]+tools:node="remove"/);
  assert.match(patched, /android:name="android.permission.ACCESS_COARSE_LOCATION"/);
  assert.match(patched, /android:name="android.permission.ACCESS_FINE_LOCATION"/);
  assert.doesNotMatch(patched, /android.permission.ACCESS_BACKGROUND_LOCATION/);
  assert.match(patched, /android\.permission\.ACCESS_WIFI_STATE[^>]+tools:node="remove"/);
});

test('generated MainActivity registers LighthouseRideMap native plugin once', () => {
  const patched = patchMainActivityForRideMapPlugin(MAIN_ACTIVITY);
  assert.match(patched, /import android\.os\.Bundle/);
  assert.match(patched, /registerPlugin\(LighthouseRideMapPlugin\.class\)/);
  assert.equal(patched.split('registerPlugin(LighthouseRideMapPlugin.class)').length - 1, 1);
  assert.equal(patchMainActivityForRideMapPlugin(patched), patched);
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
  await mkdir(join(app, 'src', 'main', 'java', 'com', 'yggdrasil', 'lighthouse'), { recursive: true });
  await writeFile(join(app, 'build.gradle'), GRADLE);
  await writeFile(join(app, 'src', 'main', 'AndroidManifest.xml'), MANIFEST);
  await writeFile(join(app, 'src', 'main', 'java', 'com', 'yggdrasil', 'lighthouse', 'MainActivity.java'), MAIN_ACTIVITY);

  const result = await applyLocalMapNativeProof(android);
  const activity = await readFile(result.activityPath, 'utf8');
  const releaseManifest = await readFile(result.manifestPath, 'utf8');
  const debugManifest = await readFile(result.debugManifestPath, 'utf8');
  const rideActivity = await readFile(result.rideMapActivityPath, 'utf8');
  const ridePlugin = await readFile(result.rideMapPluginPath, 'utf8');
  const mainActivity = await readFile(result.mainActivityPath, 'utf8');
  assert.match(activity, /pmtiles:\/\/file:\/\//);
  assert.match(activity, /getAssets\(\)\.open\(PROOF_ASSET\)/);
  assert.match(activity, /PACKAGE_STAGED source=debug_asset managed=true/);
  assert.match(activity, /RasterSource/);
  assert.match(activity, /RENDER_COMPLETE local=true networkFallback=false/);
  assert.doesNotMatch(activity, /ACCESS_(?:COARSE|FINE|BACKGROUND)_LOCATION/);
  assert.doesNotMatch(releaseManifest, /LocalPmtilesProofActivity/);
  assert.match(releaseManifest, /RideMapActivity/);
  assert.match(debugManifest, /android:exported="true"/);
  assert.match(rideActivity, /VectorSource\("basemap", "pmtiles:\/\/file:\/\//);
  assert.match(rideActivity, /GeoJsonSource/);
  assert.match(rideActivity, /ACCESS_COARSE_LOCATION/);
  assert.match(rideActivity, /ACCESS_FINE_LOCATION/);
  assert.match(rideActivity, /removeUpdates\(locationListener\)/);
  assert.match(rideActivity, /ตำแหน่งฉัน/);
  assert.doesNotMatch(rideActivity, /ACCESS_BACKGROUND_LOCATION/);
  assert.match(ridePlugin, /@CapacitorPlugin\(name = "LighthouseRideMap"\)/);
  assert.match(ridePlugin, /ACTION_OPEN_DOCUMENT/);
  assert.match(ridePlugin, /LOCAL_MAP_PM_TILES_VECTOR_REQUIRED/);
  assert.match(ridePlugin, /getFilesDir\(\), "maps"/);
  assert.match(mainActivity, /registerPlugin\(LighthouseRideMapPlugin\.class\)/);
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
