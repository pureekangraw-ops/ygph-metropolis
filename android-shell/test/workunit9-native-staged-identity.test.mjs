import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

function method(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + 1);
  assert.ok(start >= 0 && end > start, `${startMarker} must exist before ${endMarker}`);
  return source.slice(start, end);
}

test('verification persists package version and signer identity before READY_TO_INSTALL', () => {
  const verification = method(
    'private void completeVerification(String jobId, File part)',
    'private void recoverVerifyingJob',
  );
  assert.match(verification, /inspectStagedApk\(apk/);
  for (const field of ['stagedApplicationId', 'stagedVersionCode', 'stagedVersionName', 'stagedSignerSha256']) {
    assert.match(verification, new RegExp(`done\\.put\\("${field}"`));
  }
  const inspectIndex = verification.indexOf('inspectStagedApk(apk');
  const readyIndex = verification.indexOf('done.put("state", "READY_TO_INSTALL")');
  assert.ok(inspectIndex >= 0 && readyIndex > inspectIndex,
    'native APK identity inspection must happen before READY_TO_INSTALL is persisted');
});

test('native staged identity inspection validates package signer and exact durable target version', () => {
  assert.match(source, /private\s+JSObject\s+inspectStagedApk\(File apk, JSObject snapshot\)/);
  const inspect = method(
    'private JSObject inspectStagedApk(File apk, JSObject snapshot)',
    'private void recoverVerifyingJob',
  );
  assert.match(inspect, /getPackageArchiveInfo\(/);
  assert.match(inspect, /getContext\(\)\.getPackageName\(\)/);
  assert.match(inspect, /signerSha256\(/);
  assert.match(inspect, /targetVersionCode/);
  assert.match(inspect, /targetVersionName/);
  assert.match(inspect, /UPDATE_IDENTITY_MISMATCH/);
});

test('native installer re-inspects staged package version and signer after re-hash before Android handoff', () => {
  const request = method(
    'public void requestInstall(PluginCall call)',
    'public void reconcileInstalledVersion(PluginCall call)',
  );
  const rehashIndex = request.indexOf('sha256File(apk)');
  const inspectIndex = request.indexOf('inspectStagedApk(apk, snapshot)');
  const installerIndex = request.indexOf('startActivity(install)');
  assert.ok(rehashIndex >= 0 && inspectIndex > rehashIndex,
    'native installer must re-inspect identity after re-hashing the staged APK');
  assert.ok(installerIndex > inspectIndex,
    'Android installer may open only after native package/version/signer re-inspection');
});
