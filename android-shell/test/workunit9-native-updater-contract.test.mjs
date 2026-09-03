import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('native updater persists retry attempts for recovery diagnostics', () => {
  assert.match(source, /"attempts"/);
  assert.match(source, /"lastAttemptAt"/);
});

test('native updater persists staged artifact identity before installer handoff', () => {
  assert.match(source, /"stagedSha256"/);
  assert.match(source, /sha256File\(/);
});

test('native updater rejects invalid lifecycle transitions instead of silently changing state', () => {
  assert.match(source, /UPDATE_INVALID_STATE/);
  assert.match(source, /requireState\(/);
  assert.match(source, /"DOWNLOADING"/);
  assert.match(source, /"PAUSED"/);
  assert.match(source, /"STAGED"/);
});

test('native updater verifies expected SHA before staging the completed artifact', () => {
  assert.match(source, /"expectedSha256"/);
  assert.match(source, /UPDATE_ARTIFACT_MISMATCH/);
  assert.match(source, /sha256File\(part\)/);
  const digestIndex = source.indexOf('sha256File(part)');
  const renameIndex = source.indexOf('part.renameTo(apk)');
  assert.ok(digestIndex >= 0 && renameIndex >= 0 && digestIndex < renameIndex,
    'completed .part must be hashed before rename to staged APK');
});

test('native installer handoff is bound to a persisted STAGED job instead of a free path', () => {
  const start = source.indexOf('public void requestInstall(PluginCall call)');
  const end = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  assert.ok(start >= 0 && end > start, 'requestInstall method must exist');
  const method = source.slice(start, end);
  assert.match(method, /call\.getString\("jobId"\)/);
  assert.match(method, /load\(jobId\)/);
  assert.match(method, /requireState\(call, snapshot, "STAGED"/);
  assert.match(method, /snapshot\.getString\("stagedPath"\)/);
});

test('native installer re-hashes the staged APK before opening Android installer', () => {
  const start = source.indexOf('public void requestInstall(PluginCall call)');
  const end = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  assert.ok(start >= 0 && end > start, 'requestInstall method must exist');
  const method = source.slice(start, end);
  assert.match(method, /snapshot\.getString\("stagedSha256"\)/);
  assert.match(method, /sha256File\(apk\)/);
  assert.match(method, /UPDATE_ARTIFACT_MISMATCH/);
  const digestIndex = method.indexOf('sha256File(apk)');
  const installerIndex = method.indexOf('startActivity(install)');
  assert.ok(digestIndex >= 0 && installerIndex >= 0 && digestIndex < installerIndex,
    'staged APK must be re-hashed before Android installer is opened');
});

test('native updater persists permission requirement before leaving for Android settings and allows retry', () => {
  const start = source.indexOf('public void requestInstall(PluginCall call)');
  const end = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  assert.ok(start >= 0 && end > start, 'requestInstall method must exist');
  const method = source.slice(start, end);
  assert.match(method, /requireState\(call, snapshot, "STAGED", "PERMISSION_REQUIRED"\)/);
  const permissionStateIndex = method.indexOf('snapshot.put("state", "PERMISSION_REQUIRED")');
  const saveIndex = method.indexOf('save(snapshot)', permissionStateIndex);
  const settingsIndex = method.indexOf('startActivity(settings)');
  assert.ok(permissionStateIndex >= 0 && saveIndex > permissionStateIndex && settingsIndex > saveIndex,
    'PERMISSION_REQUIRED must be durable before Android settings is opened');
});

test('native updater persists installer-opened state before leaving for Android package installer', () => {
  const start = source.indexOf('public void requestInstall(PluginCall call)');
  const end = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  assert.ok(start >= 0 && end > start, 'requestInstall method must exist');
  const method = source.slice(start, end);
  const installerStateIndex = method.indexOf('snapshot.put("state", "INSTALLER_OPENED")');
  const saveIndex = method.indexOf('save(snapshot)', installerStateIndex);
  const installerIndex = method.indexOf('startActivity(install)');
  assert.ok(installerStateIndex >= 0 && saveIndex > installerStateIndex && installerIndex > saveIndex,
    'INSTALLER_OPENED must be durable before Android package installer is opened');
});
