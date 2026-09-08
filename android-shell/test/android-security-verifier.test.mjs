import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyAndroidSecurityBaseline } from '../tools/apply-android-security.mjs';
import { inspectAndroidSecurity, verifyAndroidSecurity, verifyGeneratedAndroidSecurity } from '../tools/verify-android-security.mjs';

const DYNAMIC_PERMISSION = 'com.yggdrasil.lighthouse.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION';
const PROFILE_RECEIVER = 'androidx.profileinstaller.ProfileInstallReceiver';
const PROFILE_ACTION = 'androidx.profileinstaller.action.INSTALL_PROFILE';
const SAFE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.yggdrasil.lighthouse">
  <permission android:name="${DYNAMIC_PERMISSION}" android:protectionLevel="signature" />
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="${DYNAMIC_PERMISSION}" />
  <application android:allowBackup="false" android:usesCleartextTraffic="false" android:label="LIGHTHOUSE">
    <activity android:name="com.yggdrasil.lighthouse.MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    <receiver android:name="${PROFILE_RECEIVER}" android:permission="android.permission.DUMP" android:exported="true">
      <intent-filter>
        <action android:name="${PROFILE_ACTION}" />
      </intent-filter>
    </receiver>
    <provider android:name="androidx.core.content.FileProvider" android:authorities="com.yggdrasil.lighthouse.fileprovider" android:exported="false" android:grantUriPermissions="true" />
  </application>
</manifest>`;

function replace(source, before, after) {
  assert.ok(source.includes(before), `fixture missing ${before}`);
  return source.replace(before, after);
}

const config = { appId: 'com.yggdrasil.lighthouse', plugins: {} };

test('security inspector accepts the minimal LIGHTHOUSE native surface', () => {
  const evidence = inspectAndroidSecurity({ manifestText: SAFE_MANIFEST, capacitorConfig: config, manifestPath: 'fixture/AndroidManifest.xml' });
  assert.equal(evidence.applicationId, 'com.yggdrasil.lighthouse');
  assert.deepEqual(evidence.requestedPermissions, ['android.permission.INTERNET', DYNAMIC_PERMISSION]);
  assert.deepEqual(evidence.declaredPermissions, [{ name: DYNAMIC_PERMISSION, protectionLevel: 'signature' }]);
  assert.equal(evidence.backupPolicy.allowBackup, false);
  assert.equal(evidence.networkPolicy.usesCleartextTraffic, false);
  assert.equal(evidence.debuggable, false);
  assert.equal(evidence.status, 'PROVEN');
});

test('package-scoped dynamic receiver permission is allowed only with signature protection', () => {
  assert.doesNotThrow(() => verifyAndroidSecurity({ manifestText: SAFE_MANIFEST, capacitorConfig: config }));
  const weak = replace(SAFE_MANIFEST, 'android:protectionLevel="signature"', 'android:protectionLevel="normal"');
  assert.throws(() => verifyAndroidSecurity({ manifestText: weak, capacitorConfig: config }), /ANDROID_SECURITY_DYNAMIC_PERMISSION_NOT_SIGNATURE_PROTECTED/);
});

test('unexpected Android permission fails closed', () => {
  const manifest = SAFE_MANIFEST.replace('</manifest>', '  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n</manifest>');
  assert.throws(() => verifyAndroidSecurity({ manifestText: manifest, capacitorConfig: config }), /ANDROID_SECURITY_UNEXPECTED_PERMISSION:android.permission.REQUEST_INSTALL_PACKAGES/);
});

test('non-launcher exported component fails closed', () => {
  const manifest = replace(SAFE_MANIFEST, '</application>', '  <receiver android:name="com.yggdrasil.lighthouse.SecretReceiver" android:exported="true" />\n  </application>');
  assert.throws(() => verifyAndroidSecurity({ manifestText: manifest, capacitorConfig: config }), /ANDROID_SECURITY_UNEXPECTED_EXPORTED_COMPONENT/);
});

test('backup, cleartext, and debug release posture fail closed', () => {
  const backup = replace(SAFE_MANIFEST, 'android:allowBackup="false"', 'android:allowBackup="true"');
  assert.throws(() => verifyAndroidSecurity({ manifestText: backup, capacitorConfig: config }), /ANDROID_SECURITY_BACKUP_NOT_DISABLED/);

  const cleartext = replace(SAFE_MANIFEST, 'android:usesCleartextTraffic="false"', 'android:usesCleartextTraffic="true"');
  assert.throws(() => verifyAndroidSecurity({ manifestText: cleartext, capacitorConfig: config }), /ANDROID_SECURITY_CLEARTEXT_ALLOWED/);

  const debuggable = replace(SAFE_MANIFEST, 'android:label="LIGHTHOUSE"', 'android:label="LIGHTHOUSE" android:debuggable="true"');
  assert.throws(() => verifyAndroidSecurity({ manifestText: debuggable, capacitorConfig: config }), /ANDROID_SECURITY_DEBUGGABLE_RELEASE/);
});

test('security applicator hardens generated Capacitor manifest and MainActivity without changing component topology', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lh-security-'));
  const manifestPath = join(root, 'app/src/main/AndroidManifest.xml');
  const javaRoot = join(root, 'app/src/main/java/com/yggdrasil/lighthouse');
  const mainActivityPath = join(javaRoot, 'MainActivity.java');
  await mkdir(join(root, 'app/src/main'), { recursive: true });
  await mkdir(javaRoot, { recursive: true });

  const insecure = SAFE_MANIFEST
    .replace('android:allowBackup="false"', 'android:allowBackup="true"')
    .replace('android:usesCleartextTraffic="false" ', '');
  await writeFile(manifestPath, insecure, 'utf8');
  await writeFile(mainActivityPath, `package com.yggdrasil.lighthouse;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n`, 'utf8');

  const beforeComponents = inspectAndroidSecurity({ manifestText: SAFE_MANIFEST, capacitorConfig: config }).components;
  await applyAndroidSecurityBaseline(root);
  const hardened = await readFile(manifestPath, 'utf8');
  const activity = await readFile(mainActivityPath, 'utf8');
  assert.match(hardened, /android:allowBackup="false"/);
  assert.match(hardened, /android:usesCleartextTraffic="false"/);
  assert.match(activity, /setSupportZoom\(false\)/);
  assert.match(activity, /setBuiltInZoomControls\(false\)/);
  assert.match(activity, /setDisplayZoomControls\(false\)/);
  const after = inspectAndroidSecurity({ manifestText: hardened, capacitorConfig: config });
  assert.deepEqual(after.components, beforeComponents);
});

test('generated verifier accepts the current AGP merged_manifest release layout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lh-security-agp-'));
  const manifestPath = join(root, 'app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml');
  const configPath = join(root, 'app/src/main/assets/capacitor.config.json');
  await mkdir(join(root, 'app/build/intermediates/merged_manifest/release/processReleaseMainManifest'), { recursive: true });
  await mkdir(join(root, 'app/src/main/assets'), { recursive: true });
  await writeFile(manifestPath, SAFE_MANIFEST, 'utf8');
  await writeFile(configPath, JSON.stringify(config), 'utf8');

  const evidence = await verifyGeneratedAndroidSecurity(root);
  assert.equal(evidence.status, 'PROVEN');
  assert.equal(evidence.manifestPath.replaceAll('\\', '/'), 'app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml');
});
