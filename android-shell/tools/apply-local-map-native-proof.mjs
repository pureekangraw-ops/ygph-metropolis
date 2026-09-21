import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAPLIBRE_ANDROID_VERSION = '13.6.1';
export const MAPLIBRE_ANDROID_DEPENDENCY = `implementation 'org.maplibre.gl:android-sdk:${MAPLIBRE_ANDROID_VERSION}'`;
export const PROOF_ACTIVITY = 'com.yggdrasil.lighthouse.LocalPmtilesProofActivity';

function findBlock(text, name) {
  const match = new RegExp(`\\b${name}\\s*\\{`).exec(text);
  if (!match) throw new Error(`LOCAL_MAP_NATIVE_${name.toUpperCase()}_BLOCK_MISSING`);
  const open = text.indexOf('{', match.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < text.length; index += 1) {
    const ch = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { open, close: index };
    }
  }
  throw new Error(`LOCAL_MAP_NATIVE_${name.toUpperCase()}_BLOCK_UNCLOSED`);
}

export function patchGradleForLocalMapProof(text) {
  if (text.includes(MAPLIBRE_ANDROID_DEPENDENCY)) return text;
  const block = findBlock(text, 'dependencies');
  return text.slice(0, block.close) + `    ${MAPLIBRE_ANDROID_DEPENDENCY}\n` + text.slice(block.close);
}

function ensureToolsNamespace(manifest) {
  const open = /<manifest\b[^>]*>/s.exec(manifest);
  if (!open) throw new Error('LOCAL_MAP_NATIVE_MANIFEST_TAG_MISSING');
  if (/xmlns:tools=/.test(open[0])) return manifest;
  const patched = open[0].replace(/>$/, ' xmlns:tools="http://schemas.android.com/tools">');
  return manifest.slice(0, open.index) + patched + manifest.slice(open.index + open[0].length);
}

export function patchManifestForLocalMapProof(input) {
  let manifest = ensureToolsNamespace(input);
  const manifestOpen = /<manifest\b[^>]*>/s.exec(manifest);
  const removals = [
    'android.permission.ACCESS_WIFI_STATE',
  ].filter(permission => !manifest.includes(`android:name="${permission}" tools:node="remove"`))
    .map(permission => `  <uses-permission android:name="${permission}" tools:node="remove" />`)
    .join('\n');

  if (removals) {
    const at = manifestOpen.index + manifestOpen[0].length;
    manifest = manifest.slice(0, at) + `\n${removals}` + manifest.slice(at);
  }

  const foregroundLocationPermissions = [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
  ].filter(permission => !manifest.includes(`android:name="${permission}"`))
    .map(permission => `  <uses-permission android:name="${permission}" />`)
    .join('\n');
  if (foregroundLocationPermissions) {
    const open = /<manifest\b[^>]*>/s.exec(manifest);
    const at = open.index + open[0].length;
    manifest = manifest.slice(0, at) + `\n${foregroundLocationPermissions}` + manifest.slice(at);
  }

  if (!manifest.includes('android:name=".RideMapActivity"')) {
    const end = manifest.indexOf('</application>');
    if (end < 0) throw new Error('LOCAL_MAP_NATIVE_APPLICATION_CLOSE_MISSING');
    const activity = [
      '    <activity',
      '      android:name=".RideMapActivity"',
      '      android:exported="false" />',
      '',
    ].join('\n');
    manifest = manifest.slice(0, end) + activity + manifest.slice(end);
  }
  return manifest;
}

export function patchMainActivityForRideMapPlugin(input) {
  if (input.includes('registerPlugin(LighthouseRideMapPlugin.class)')) return input;
  let source = input;
  if (!source.includes('import android.os.Bundle;')) {
    const packageEnd = source.indexOf(';');
    if (packageEnd < 0) throw new Error('LOCAL_MAP_NATIVE_MAIN_ACTIVITY_PACKAGE_MISSING');
    source = source.slice(0, packageEnd + 1) + '\n\nimport android.os.Bundle;' + source.slice(packageEnd + 1);
  }

  const emptyClass = /public class MainActivity extends BridgeActivity\s*\{\s*\}/;
  if (emptyClass.test(source)) {
    return source.replace(emptyClass, `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(LighthouseRideMapPlugin.class);
    }
}`);
  }

  const close = source.lastIndexOf('}');
  if (close < 0) throw new Error('LOCAL_MAP_NATIVE_MAIN_ACTIVITY_CLASS_MISSING');
  const method = `
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(LighthouseRideMapPlugin.class);
    }
`;
  return source.slice(0, close) + method + source.slice(close);
}

export function debugProofManifest() {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <activity
      android:name="com.yggdrasil.lighthouse.LocalPmtilesProofActivity"
      android:exported="true" />
  </application>
</manifest>
`;
}

export function localPmtilesProofActivitySource() {
  return `package com.yggdrasil.lighthouse;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.maps.MapView;
import org.maplibre.android.maps.Style;
import org.maplibre.android.style.layers.RasterLayer;
import org.maplibre.android.style.sources.RasterSource;

public final class LocalPmtilesProofActivity extends Activity {
  private static final String TAG = "LIGHTHOUSE_LOCAL_MAP";
  private static final String PROOF_ASSET = "local-map-proof/gate1-proof.pmtiles";
  private MapView mapView;
  private boolean renderReported = false;

  private boolean stageProofPackage(File mapsRoot, File packageFile) {
    if (!mapsRoot.isDirectory() && !mapsRoot.mkdirs()) {
      Log.e(TAG, "PROOF_FAILED reason=managed_root_create");
      return false;
    }
    if (packageFile.isFile()) return true;

    try (InputStream input = getAssets().open(PROOF_ASSET);
         FileOutputStream output = new FileOutputStream(packageFile, false)) {
      byte[] buffer = new byte[8192];
      int read;
      while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
      output.flush();
      Log.i(TAG, "PACKAGE_STAGED source=debug_asset managed=true");
      return true;
    } catch (IOException error) {
      Log.e(TAG, "PROOF_FAILED reason=asset_stage", error);
      return false;
    }
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    MapLibre.getInstance(this);

    File mapsRoot = new File(getFilesDir(), "maps");
    File packageFile = new File(mapsRoot, "gate1-proof.pmtiles");
    if (!stageProofPackage(mapsRoot, packageFile)) {
      finish();
      return;
    }

    try {
      String root = mapsRoot.getCanonicalPath() + File.separator;
      String candidate = packageFile.getCanonicalPath();
      if (!candidate.startsWith(root) || !packageFile.isFile()) {
        Log.e(TAG, "PROOF_FAILED reason=managed_file_missing");
        finish();
        return;
      }
    } catch (IOException error) {
      Log.e(TAG, "PROOF_FAILED reason=canonical_path", error);
      finish();
      return;
    }

    mapView = new MapView(this);
    mapView.setLayoutParams(new ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    ));
    setContentView(mapView);
    mapView.onCreate(savedInstanceState);

    mapView.addOnDidFinishRenderingMapListener(fully -> {
      if (fully && !renderReported) {
        renderReported = true;
        Log.i(TAG, "RENDER_COMPLETE local=true networkFallback=false");
      }
    });

    mapView.getMapAsync(map -> {
      String baseStyle = "{\\\"version\\\":8,\\\"sources\\\":{},\\\"layers\\\":[{\\\"id\\\":\\\"proof-background\\\",\\\"type\\\":\\\"background\\\",\\\"paint\\\":{\\\"background-color\\\":\\\"#000000\\\"}}]}";
      map.setStyle(new Style.Builder().fromJson(baseStyle), style -> {
        String pmtilesUri = "pmtiles://file://" + packageFile.getAbsolutePath();
        RasterSource source = new RasterSource("gate1-proof", pmtilesUri, 256);
        style.addSource(source);
        style.addLayer(new RasterLayer("gate1-proof-layer", "gate1-proof"));
        map.setCameraPosition(new CameraPosition.Builder()
          .target(new LatLng(0.0, 0.0))
          .zoom(0.0)
          .build());
        Log.i(TAG, "SOURCE_ATTACHED scheme=pmtiles+file managed=true");
      });
    });
  }

  @Override protected void onStart() { super.onStart(); if (mapView != null) mapView.onStart(); }
  @Override protected void onResume() { super.onResume(); if (mapView != null) mapView.onResume(); }
  @Override protected void onPause() { if (mapView != null) mapView.onPause(); super.onPause(); }
  @Override protected void onStop() { if (mapView != null) mapView.onStop(); super.onStop(); }
  @Override public void onLowMemory() { super.onLowMemory(); if (mapView != null) mapView.onLowMemory(); }
  @Override protected void onDestroy() { if (mapView != null) mapView.onDestroy(); super.onDestroy(); }
  @Override protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    if (mapView != null) mapView.onSaveInstanceState(outState);
  }
}
`;
}

export async function applyLocalMapNativeProof(androidRoot) {
  const gradlePath = join(androidRoot, 'app', 'build.gradle');
  const manifestPath = join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
  const debugManifestPath = join(androidRoot, 'app', 'src', 'debug', 'AndroidManifest.xml');
  const javaRoot = join(androidRoot, 'app', 'src', 'main', 'java', 'com', 'yggdrasil', 'lighthouse');
  const activityPath = join(javaRoot, 'LocalPmtilesProofActivity.java');
  const rideMapActivityPath = join(javaRoot, 'RideMapActivity.java');
  const rideMapPluginPath = join(javaRoot, 'LighthouseRideMapPlugin.java');
  const mainActivityPath = join(javaRoot, 'MainActivity.java');
  const templateRoot = join('native-local-map');

  const gradle = patchGradleForLocalMapProof(await readFile(gradlePath, 'utf8'));
  await writeFile(gradlePath, gradle, 'utf8');

  const manifest = patchManifestForLocalMapProof(await readFile(manifestPath, 'utf8'));
  await writeFile(manifestPath, manifest, 'utf8');

  await mkdir(dirname(debugManifestPath), { recursive: true });
  await writeFile(debugManifestPath, debugProofManifest(), 'utf8');

  await mkdir(dirname(activityPath), { recursive: true });
  await writeFile(activityPath, localPmtilesProofActivitySource(), 'utf8');

  await copyFile(join(templateRoot, 'RideMapActivity.java'), rideMapActivityPath);
  await copyFile(join(templateRoot, 'LighthouseRideMapPlugin.java'), rideMapPluginPath);

  const mainActivity = patchMainActivityForRideMapPlugin(await readFile(mainActivityPath, 'utf8'));
  await writeFile(mainActivityPath, mainActivity, 'utf8');

  return {
    maplibreVersion: MAPLIBRE_ANDROID_VERSION,
    gradlePath,
    manifestPath,
    debugManifestPath,
    activityPath,
    rideMapActivityPath,
    rideMapPluginPath,
    mainActivityPath,
    proofActivity: PROOF_ACTIVITY,
  };
}

async function main() {
  const androidRoot = process.argv[2] || 'android';
  console.log(JSON.stringify(await applyLocalMapNativeProof(androidRoot)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
