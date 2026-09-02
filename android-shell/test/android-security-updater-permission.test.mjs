import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAndroidSecurity } from '../tools/verify-android-security.mjs';

const BASE=`<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.yggdrasil.lighthouse">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
  <application android:allowBackup="false" android:usesCleartextTraffic="false" android:label="LIGHTHOUSE">
    <activity android:name="com.yggdrasil.lighthouse.MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    <provider android:name="androidx.core.content.FileProvider" android:authorities="com.yggdrasil.lighthouse.updater.fileprovider" android:exported="false" android:grantUriPermissions="true" />
  </application>
</manifest>`;

test('security contract explicitly allows REQUEST_INSTALL_PACKAGES for the in-app APK updater',()=>{
  assert.doesNotThrow(()=>verifyAndroidSecurity({manifestText:BASE,capacitorConfig:{appId:'com.yggdrasil.lighthouse',plugins:{}}}));
});

test('security contract still rejects unrelated dangerous permission',()=>{
  const manifest=BASE.replace('</manifest>','  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n</manifest>');
  assert.throws(()=>verifyAndroidSecurity({manifestText:manifest,capacitorConfig:{appId:'com.yggdrasil.lighthouse',plugins:{}}}),/ANDROID_SECURITY_UNEXPECTED_PERMISSION:android.permission.ACCESS_FINE_LOCATION/);
});
