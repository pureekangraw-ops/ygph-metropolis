import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAndroidSecurity } from '../tools/verify-android-security.mjs';

const manifestText = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.yggdrasil.lighthouse">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
  <application android:allowBackup="false" android:usesCleartextTraffic="false" android:debuggable="false">
    <activity android:name="com.yggdrasil.lighthouse.MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    <provider android:name="androidx.core.content.FileProvider" android:authorities="com.yggdrasil.lighthouse.updater.files" android:exported="false" android:grantUriPermissions="true" />
  </application>
</manifest>`;

test('security verifier admits REQUEST_INSTALL_PACKAGES only with a private FileProvider surface', () => {
  const evidence = verifyAndroidSecurity({ manifestText, capacitorConfig:{ appId:'com.yggdrasil.lighthouse' } });
  assert.equal(evidence.status, 'PROVEN');
  assert.deepEqual(evidence.requestedPermissions, [
    'android.permission.INTERNET',
    'android.permission.REQUEST_INSTALL_PACKAGES',
  ]);
  assert.equal(evidence.components.find(item => item.type === 'provider')?.exported, false);
});
