import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFingerprint,
  parseApksignerCertificateSha256,
  parseAaptBadging,
  assertApkIdentity,
} from '../tools/verify-apk-identity.mjs';

test('parses APK signer certificate SHA-256 and normalizes punctuation', () => {
  const output = 'Signer #1 certificate SHA-256 digest: AA:E6:08:A7:DD:AB:0D:BF:CC:C1:D3:5E:81:7C:56:83:B3:C6:4B:90:AB:58:1A:4B:74:86:7D:B5:4E:03:51:CE';
  assert.equal(parseApksignerCertificateSha256(output), 'aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce');
  assert.equal(normalizeFingerprint('AA:E6'), 'aae6');
});

test('parses package/version identity from aapt badging', () => {
  const badging = "package: name='com.yggdrasil.lighthouse' versionCode='1001' versionName='1.0.0' platformBuildVersionName='16'";
  assert.deepEqual(parseAaptBadging(badging), {
    applicationId: 'com.yggdrasil.lighthouse',
    versionCode: 1001,
    versionName: '1.0.0',
  });
});

test('fails closed on package, signer, or version mismatch', () => {
  const expected = {
    applicationId: 'com.yggdrasil.lighthouse',
    signerCertificateSha256: 'aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce',
    versionCode: 1001,
    versionName: '1.0.0',
  };
  assert.doesNotThrow(() => assertApkIdentity(expected, expected));
  assert.throws(() => assertApkIdentity({ ...expected, applicationId: 'bad.id' }, expected), /APK_APPLICATION_ID_MISMATCH/);
  assert.throws(() => assertApkIdentity({ ...expected, signerCertificateSha256: '0'.repeat(64) }, expected), /APK_SIGNER_MISMATCH/);
  assert.throws(() => assertApkIdentity({ ...expected, versionCode: 1000 }, expected), /APK_VERSION_CODE_MISMATCH/);
});
