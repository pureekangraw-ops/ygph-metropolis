import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('native updater persists retry attempts for recovery diagnostics', () => {
  assert.match(source, /"attempts"/);
  assert.match(source, /"lastAttemptAt"/);
});

test('native updater persists target version metadata from the update candidate', () => {
  const start = source.indexOf('public void startDownload(PluginCall call)');
  const end = source.indexOf('public void getJobSnapshot(PluginCall call)');
  assert.ok(start >= 0 && end > start, 'startDownload method must exist');
  const method = source.slice(start, end);
  assert.match(method, /call\.getLong\("targetVersionCode"\)/);
  assert.match(method, /call\.getString\("targetVersionName"\)/);
  assert.match(method, /UPDATE_TARGET_VERSION_CODE_REQUIRED/);
  assert.match(method, /snapshot\.put\("targetVersionCode",\s*targetVersionCode\)/);
  assert.match(method, /snapshot\.put\("targetVersionName",\s*targetVersionName\)/);
});

test('native updater persists staged artifact identity before installer handoff', () => {
  assert.match(source, /"stagedSha256"/);
  assert.match(source, /sha256File\(/);
});

test('native updater uses canonical READY_TO_INSTALL lifecycle state', () => {
  assert.match(source, /UPDATE_INVALID_STATE/);
  assert.match(source, /requireState\(/);
  assert.match(source, /"DOWNLOADING"/);
  assert.match(source, /"PAUSED"/);
  assert.match(source, /"READY_TO_INSTALL"/);
  assert.doesNotMatch(source, /"STAGED"/);
});

test('native updater verifies expected SHA before making the completed artifact ready to install', () => {
  assert.match(source, /"expectedSha256"/);
  assert.match(source, /UPDATE_ARTIFACT_MISMATCH/);
  assert.match(source, /sha256File\(part\)/);
  const digestIndex = source.indexOf('sha256File(part)');
  const renameIndex = source.indexOf('part.renameTo(apk)');
  const readyIndex = source.indexOf('done.put("state", "READY_TO_INSTALL")');
  assert.ok(digestIndex >= 0 && renameIndex >= 0 && digestIndex < renameIndex,
    'completed .part must be hashed before rename to ready APK');
  assert.ok(renameIndex >= 0 && readyIndex > renameIndex,
    'job can become READY_TO_INSTALL only after verified artifact is renamed into place');
});

test('native installer handoff is bound to a persisted READY_TO_INSTALL job instead of a free path', () => {
  const start = source.indexOf('public void requestInstall(PluginCall call)');
  const end = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  assert.ok(start >= 0 && end > start, 'requestInstall method must exist');
  const method = source.slice(start, end);
  assert.match(method, /call\.getString\("jobId"\)/);
  assert.match(method, /load\(jobId\)/);
  assert.match(method, /requireState\(call, snapshot, "READY_TO_INSTALL", "PERMISSION_REQUIRED"\)/);
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
  assert.match(method, /requireState\(call, snapshot, "READY_TO_INSTALL", "PERMISSION_REQUIRED"\)/);
  const permissionStateIndex = method.indexOf('snapshot.put("state", "PERMISSION_REQUIRED")');
  const saveIndex = method.indexOf('save(snapshot)', permissionStateIndex);
  const settingsIndex = method.indexOf('startActivity(settings)');
  assert.ok(permissionStateIndex >= 0 && saveIndex > permissionStateIndex && settingsIndex > saveIndex,
    'PERMISSION_REQUIRED must be durable before Android settings is opened');
});

test('native updater resumes permission-required job after Android settings', () => {
  const requestStart = source.indexOf('public void requestInstall(PluginCall call)');
  const requestEnd = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  assert.ok(requestStart >= 0 && requestEnd > requestStart, 'requestInstall method must exist');
  const request = source.slice(requestStart, requestEnd);
  const permissionStateIndex = request.indexOf('snapshot.put("state", "PERMISSION_REQUIRED")');
  const permissionSaveIndex = request.indexOf('save(snapshot)', permissionStateIndex);
  const pendingIndex = request.indexOf('putString(PENDING_INSTALL_JOB, jobId)', permissionSaveIndex);
  const settingsIndex = request.indexOf('startActivity(settings)');
  assert.ok(permissionStateIndex >= 0 && permissionSaveIndex > permissionStateIndex && pendingIndex > permissionSaveIndex && settingsIndex > pendingIndex,
    'permission-required job identity must be durable before leaving for Android settings');

  const resumeStart = source.indexOf('protected void handleOnResume()');
  const resumeEnd = source.indexOf('@PluginMethod', resumeStart);
  assert.ok(resumeStart >= 0 && resumeEnd > resumeStart, 'handleOnResume must exist before plugin methods');
  const resume = source.slice(resumeStart, resumeEnd);
  assert.match(resume, /"PERMISSION_REQUIRED"\.equals\(snapshot\.getString\("state"\)\)/);
  assert.match(resume, /canRequestPackageInstalls\(\)/);
  const readyIndex = resume.indexOf('snapshot.put("state", "READY_TO_INSTALL")');
  const readySaveIndex = resume.indexOf('save(snapshot)', readyIndex);
  const clearIndex = resume.indexOf('remove(PENDING_INSTALL_JOB)', readySaveIndex);
  assert.ok(readyIndex >= 0 && readySaveIndex > readyIndex && clearIndex > readySaveIndex,
    'granted install permission must durably restore READY_TO_INSTALL and clear the external handoff pointer');
});

test('native updater persists WAITING_ANDROID_CONFIRMATION before opening Android package installer', () => {
  const start = source.indexOf('public void requestInstall(PluginCall call)');
  const end = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  assert.ok(start >= 0 && end > start, 'requestInstall method must exist');
  const method = source.slice(start, end);
  assert.doesNotMatch(method, /INSTALLER_OPENED/);
  const waitingStateIndex = method.indexOf('snapshot.put("state", "WAITING_ANDROID_CONFIRMATION")');
  const saveIndex = method.indexOf('save(snapshot)', waitingStateIndex);
  const installerIndex = method.indexOf('startActivity(install)');
  assert.ok(waitingStateIndex >= 0 && saveIndex > waitingStateIndex && installerIndex > saveIndex,
    'WAITING_ANDROID_CONFIRMATION must be durable before Android package installer is opened');
});

test('native updater persists pending installer job identity before Android handoff', () => {
  const start = source.indexOf('public void requestInstall(PluginCall call)');
  const end = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  assert.ok(start >= 0 && end > start, 'requestInstall method must exist');
  const method = source.slice(start, end);
  const waitingStateIndex = method.indexOf('snapshot.put("state", "WAITING_ANDROID_CONFIRMATION")');
  const saveIndex = method.indexOf('save(snapshot)', waitingStateIndex);
  const pendingIndex = method.indexOf('putString(PENDING_INSTALL_JOB, jobId)');
  const installerIndex = method.indexOf('startActivity(install)');
  assert.ok(waitingStateIndex >= 0 && saveIndex > waitingStateIndex && pendingIndex > saveIndex && installerIndex > pendingIndex,
    'pending installer job must be durable after WAITING state and before Android handoff');
});

test('installed readback bridge is bound to the waiting job and delegates to shared reconciler', () => {
  const start = source.indexOf('public void reconcileInstalledVersion(PluginCall call)');
  const end = source.indexOf('private JSObject reconcileInstalledJob', start);
  assert.ok(start >= 0 && end > start, 'reconcileInstalledVersion and shared reconciler must exist');
  const method = source.slice(start, end);
  assert.match(method, /call\.getString\("jobId"\)/);
  assert.match(method, /load\(jobId\)/);
  assert.match(method, /requireState\(call, snapshot, "WAITING_ANDROID_CONFIRMATION"\)/);
  assert.match(method, /reconcileInstalledJob\(jobId, snapshot\)/);
});

test('shared installed readback compares PackageManager version against durable targetVersionCode', () => {
  const start = source.indexOf('private JSObject reconcileInstalledJob');
  const end = source.indexOf('private boolean requireState', start);
  assert.ok(start >= 0 && end > start, 'shared installed reconciler must exist');
  const method = source.slice(start, end);
  assert.match(method, /nullableLong\(snapshot, "targetVersionCode"\)/);
  assert.doesNotMatch(method, /minVersionCode/);

  const readbackStateIndex = method.indexOf('snapshot.put("state", "READBACK")');
  const readbackSaveIndex = method.indexOf('save(snapshot)', readbackStateIndex);
  const packageReadIndex = method.indexOf('getPackageInfo(');
  assert.ok(readbackStateIndex >= 0 && readbackSaveIndex > readbackStateIndex && packageReadIndex > readbackSaveIndex,
    'READBACK must be durable before PackageManager identity is read');

  assert.match(method, /installedVersionCode\s*>=\s*targetVersionCode/);
  assert.match(method, /snapshot\.put\("state",\s*"DONE"\)/);
  assert.match(method, /snapshot\.put\("state",\s*"READY_TO_INSTALL"\)/);
  assert.match(method, /snapshot\.put\("installedVersionCode",\s*installedVersionCode\)/);
  assert.match(method, /snapshot\.put\("installedVersionName",\s*info\.versionName\)/);
  assert.match(method, /snapshot\.put\("installedSignerSha256",\s*installedSignerSha256\)/);
  assert.match(method, /save\(snapshot\)/);
  assert.match(method, /return snapshot/);
});

test('failed installed readback restores waiting state so resume can retry', () => {
  const start = source.indexOf('private JSObject reconcileInstalledJob');
  const end = source.indexOf('private boolean requireState', start);
  assert.ok(start >= 0 && end > start, 'shared installed reconciler must exist');
  const method = source.slice(start, end);
  const packageReadIndex = method.indexOf('getPackageInfo(');
  const catchIndex = method.indexOf('catch (Exception e)');
  const retryStateIndex = method.indexOf('snapshot.put("state", "WAITING_ANDROID_CONFIRMATION")', catchIndex);
  const retryErrorIndex = method.indexOf('snapshot.put("error", "INSTALLED_READBACK_FAILED")', catchIndex);
  const retrySaveIndex = method.indexOf('save(snapshot)', retryErrorIndex);
  const throwIndex = method.indexOf('throw e', retrySaveIndex);
  assert.ok(packageReadIndex >= 0 && catchIndex > packageReadIndex && retryStateIndex > catchIndex,
    'readback failure must restore WAITING_ANDROID_CONFIRMATION after PackageManager failure');
  assert.ok(retryErrorIndex > retryStateIndex && retrySaveIndex > retryErrorIndex && throwIndex > retrySaveIndex,
    'retryable readback failure must be durably recorded before propagating the error');
});

test('native updater reconciles pending installer job on app resume', () => {
  const start = source.indexOf('protected void handleOnResume()');
  const end = source.indexOf('@PluginMethod', start);
  assert.ok(start >= 0 && end > start, 'handleOnResume must exist before plugin methods');
  const method = source.slice(start, end);
  assert.match(method, /prefs\(\)\.getString\(PENDING_INSTALL_JOB, null\)/);
  assert.match(method, /load\(jobId\)/);
  assert.match(method, /"WAITING_ANDROID_CONFIRMATION"\.equals\(snapshot\.getString\("state"\)\)/);
  assert.match(method, /reconcileInstalledJob\(jobId, snapshot\)/);
});
