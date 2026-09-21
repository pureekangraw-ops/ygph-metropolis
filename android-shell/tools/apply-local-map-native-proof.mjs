import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.ACCESS_WIFI_STATE',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
  ].filter(permission => !manifest.includes(`android:name="${permission}" tools:node="remove"`))
    .map(permission => `  <uses-permission android:name="${permission}" tools:node="remove" />`)
    .join('\n');

  if (removals) {
    const at = manifestOpen.index + manifestOpen[0].length;
    manifest = manifest.slice(0, at) + `\n${removals}` + manifest.slice(at);
  }

  if (!manifest.includes('android:name=".LocalPmtilesProofActivity"')) {
    const end = manifest.indexOf('</application>');
    if (end < 0) throw new Error('LOCAL_MAP_NATIVE_APPLICATION_CLOSE_MISSING');
    const activity = [
      '    <activity',
      '      android:name=".LocalPmtilesProofActivity"',
      '      android:exported="false"',
      '      android:theme="@style/AppTheme.NoActionBarLaunch" />',
      '',
    ].join('\n');
    manifest = manifest.slice(0, end) + activity + manifest.slice(end);
  }
  return manifest;
}

export function localPmtilesProofActivitySource() {
  return `package com.yggdrasil.lighthouse;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;

import java.io.File;
import java.io.IOException;

import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.maps.MapView;
import org.maplibre.android.maps.Style;
import org.maplibre.android.style.layers.RasterLayer;
import org.maplibre.android.style.sources.RasterSource;

public final class LocalPmtilesProofActivity extends Activity {
  private static final String TAG = "LIGHTHOUSE_LOCAL_MAP";
  private MapView mapView;
  private boolean renderReported = false;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    MapLibre.getInstance(this);

    File mapsRoot = new File(getFilesDir(), "maps");
    File packageFile = new File(mapsRoot, "gate1-proof.pmtiles");
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

  @Override protected void onStart() { super.onStart(); mapView.onStart(); }
  @Override protected void onResume() { super.onResume(); mapView.onResume(); }
  @Override protected void onPause() { mapView.onPause(); super.onPause(); }
  @Override protected void onStop() { mapView.onStop(); super.onStop(); }
  @Override public void onLowMemory() { super.onLowMemory(); mapView.onLowMemory(); }
  @Override protected void onDestroy() { mapView.onDestroy(); super.onDestroy(); }
  @Override protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    mapView.onSaveInstanceState(outState);
  }
}
`;
}

export async function applyLocalMapNativeProof(androidRoot) {
  const gradlePath = join(androidRoot, 'app', 'build.gradle');
  const manifestPath = join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
  const activityPath = join(androidRoot, 'app', 'src', 'main', 'java', 'com', 'yggdrasil', 'lighthouse', 'LocalPmtilesProofActivity.java');

  const gradle = patchGradleForLocalMapProof(await readFile(gradlePath, 'utf8'));
  await writeFile(gradlePath, gradle, 'utf8');

  const manifest = patchManifestForLocalMapProof(await readFile(manifestPath, 'utf8'));
  await writeFile(manifestPath, manifest, 'utf8');

  await mkdir(dirname(activityPath), { recursive: true });
  await writeFile(activityPath, localPmtilesProofActivitySource(), 'utf8');

  return {
    maplibreVersion: MAPLIBRE_ANDROID_VERSION,
    gradlePath,
    manifestPath,
    activityPath,
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
