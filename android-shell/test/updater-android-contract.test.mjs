import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const plugin = await readFile(new URL('../android-template/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');
const applyTool = await readFile(new URL('../tools/apply-updater-android.mjs', import.meta.url), 'utf8');
const filePaths = await readFile(new URL('../android-template/file_paths.xml', import.meta.url), 'utf8');

test('native updater persists DownloadManager job state and reads installed package reality', () => {
  assert.match(plugin, /DownloadManager/);
  assert.match(plugin, /SharedPreferences/);
  assert.match(plugin, /downloadId/);
  assert.match(plugin, /getPackageInfo/);
  assert.match(plugin, /versionCode/);
  assert.match(plugin, /versionName/);
});

test('native updater verifies SHA package version and signer before install', () => {
  assert.match(plugin, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(plugin, /getPackageArchiveInfo/);
  assert.match(plugin, /GET_SIGNING_CERTIFICATES/);
  assert.match(plugin, /signer-mismatch/);
  assert.match(plugin, /package-mismatch/);
  assert.match(plugin, /version-not-newer/);
  assert.match(plugin, /sha256-mismatch/);
});

test('native updater uses unknown-source permission and FileProvider content URI with user-visible installer', () => {
  assert.match(plugin, /canRequestPackageInstalls/);
  assert.match(plugin, /ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
  assert.match(plugin, /FileProvider\.getUriForFile/);
  assert.match(plugin, /FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(plugin, /ACTION_VIEW/);
  assert.doesNotMatch(plugin, /Uri\.fromFile/);
  assert.doesNotMatch(plugin, /file:\/\//);
});

test('native updater exposes installed-version reconciliation and cleans staged APK only on success', () => {
  assert.match(plugin, /reconcileInstalledVersion/);
  assert.match(plugin, /installAttempted/);
  assert.match(plugin, /updated-successfully/);
  assert.match(plugin, /install-not-completed/);
  assert.match(plugin, /deleteStagedFile\(\)/);
});

test('generated Android patch adds REQUEST_INSTALL_PACKAGES and FileProvider without clearing app data', () => {
  assert.match(applyTool, /REQUEST_INSTALL_PACKAGES/);
  assert.match(applyTool, /androidx\.core\.content\.FileProvider/);
  assert.match(applyTool, /file_paths/);
  assert.doesNotMatch(applyTool, /pm clear|clearApplicationUserData|uninstallPackage|DELETE_PACKAGES/);
  assert.match(filePaths, /external-files-path/);
});
