import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUpdateManifest,
  compareUpdateVersion,
  projectDownloadProgress,
} from '../src/updater-contract.mjs';

const valid = Object.freeze({
  versionName:'2.0.2',
  versionCode:2002,
  packageName:'com.yggdrasil.lighthouse',
  apkUrl:'https://github.com/pureekangraw-ops/ygph-metropolis/releases/download/lighthouse-2.0.2/LIGHTHOUSE-2.0.2.apk',
  sha256:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  sizeBytes:3000000,
  releaseNotes:'Updater acceptance target',
});

test('manifest validation accepts complete controlled HTTPS release metadata', () => {
  assert.deepEqual(
    validateUpdateManifest(valid, { packageName:'com.yggdrasil.lighthouse' }),
    valid,
  );
});

test('manifest validation rejects missing fields, wrong package, non-HTTPS and floating latest APK URLs', () => {
  for (const field of ['versionName','versionCode','packageName','apkUrl','sha256','sizeBytes','releaseNotes']) {
    const candidate = { ...valid };
    delete candidate[field];
    assert.throws(() => validateUpdateManifest(candidate, { packageName:'com.yggdrasil.lighthouse' }), /UPDATE_MANIFEST_INVALID/);
  }
  assert.throws(() => validateUpdateManifest({ ...valid, packageName:'other.app' }, { packageName:'com.yggdrasil.lighthouse' }), /UPDATE_PACKAGE_MISMATCH/);
  assert.throws(() => validateUpdateManifest({ ...valid, apkUrl:'http://example.com/app.apk' }, { packageName:'com.yggdrasil.lighthouse' }), /UPDATE_APK_URL_INVALID/);
  assert.throws(() => validateUpdateManifest({ ...valid, apkUrl:'https://github.com/example/app/releases/latest/download/app.apk' }, { packageName:'com.yggdrasil.lighthouse' }), /UPDATE_APK_URL_NOT_IMMUTABLE/);
  assert.throws(() => validateUpdateManifest({ ...valid, sha256:'abc' }, { packageName:'com.yggdrasil.lighthouse' }), /UPDATE_SHA256_INVALID/);
});

test('version comparison allows only strictly higher versionCode', () => {
  assert.equal(compareUpdateVersion({ installedVersionCode:2001, candidateVersionCode:2002 }), 'upgrade');
  assert.equal(compareUpdateVersion({ installedVersionCode:2001, candidateVersionCode:2001 }), 'same');
  assert.equal(compareUpdateVersion({ installedVersionCode:2001, candidateVersionCode:2000 }), 'downgrade');
});

test('download progress uses real bytes and never invents percent when total is unknown', () => {
  assert.deepEqual(projectDownloadProgress({ downloadedBytes:500, totalBytes:1000 }), {
    indeterminate:false,
    percent:50,
    downloadedBytes:500,
    totalBytes:1000,
  });
  assert.deepEqual(projectDownloadProgress({ downloadedBytes:500, totalBytes:-1 }), {
    indeterminate:true,
    percent:null,
    downloadedBytes:500,
    totalBytes:null,
  });
  assert.deepEqual(projectDownloadProgress({ downloadedBytes:500, totalBytes:null }), {
    indeterminate:true,
    percent:null,
    downloadedBytes:500,
    totalBytes:null,
  });
});
