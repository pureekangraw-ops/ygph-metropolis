import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstallOverDeviceEvidence } from '../tools/create-install-over-device-evidence.mjs';

const signer = 'aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce';

function snapshot(versionCode, overrides = {}) {
  return {
    source: 'ADB_INSTALLED_APK',
    installedApplicationId: 'com.yggdrasil.lighthouse',
    installedSignerCertificateSha256: signer,
    versionCode,
    versionName: versionCode === 1007 ? '1.0.0-owner.2' : '1.0.0-owner.3',
    apkSha256: versionCode === 1007 ? 'b'.repeat(64) : 'c'.repeat(64),
    ...overrides,
  };
}

test('builds device acceptance evidence from before/after installed snapshots and persistence probe', () => {
  const result = createInstallOverDeviceEvidence({
    beforeInstalled: snapshot(1007),
    afterInstalled: snapshot(1008),
    persistenceProbe: {
      key: 'GREENFIELD_DATABASE_VAULT_SHA256',
      before: 'sha256:' + 'a'.repeat(64),
      after: 'sha256:' + 'a'.repeat(64),
    },
    launchEvidence: {
      source:'ADB_AM_START_WAIT',
      applicationId:'com.yggdrasil.lighthouse',
      component:'com.yggdrasil.lighthouse/.MainActivity',
      launched:true,
      processId:'4242',
    },
  });

  assert.equal(result.installMode, 'INSTALL_OVER');
  assert.equal(result.installedApplicationId, 'com.yggdrasil.lighthouse');
  assert.equal(result.installedApkSha256, 'c'.repeat(64));
  assert.equal(result.beforeVersionCode, 1007);
  assert.equal(result.afterVersionCode, 1008);
  assert.equal(result.readbackVersionCode, 1008);
  assert.equal(result.launchedAfterInstall, true);
});

test('requires a real adb post-install launch receipt instead of a manual boolean', () => {
  assert.throws(() => createInstallOverDeviceEvidence({
    beforeInstalled: snapshot(1007),
    afterInstalled: snapshot(1008),
    persistenceProbe: { key: 'probe', before: 'same', after: 'same' },
  }), /INSTALL_OVER_LAUNCH_EVIDENCE_REQUIRED/);

  assert.throws(() => createInstallOverDeviceEvidence({
    beforeInstalled: snapshot(1007),
    afterInstalled: snapshot(1008),
    persistenceProbe: { key: 'probe', before: 'same', after: 'same' },
    launchEvidence: {
      source:'ADB_AM_START_WAIT',
      applicationId:'other.app',
      component:'other.app/.MainActivity',
      launched:true,
      processId:'4242',
    },
  }), /INSTALL_OVER_LAUNCH_APP_ID_MISMATCH/);
});

test('rejects snapshots from different app identities or signer lineage before acceptance evaluation', () => {
  assert.throws(() => createInstallOverDeviceEvidence({
    beforeInstalled: snapshot(1007),
    afterInstalled: snapshot(1008, { installedApplicationId: 'other.app' }),
    persistenceProbe: { key: 'probe', before: 'same', after: 'same' },
  }), /INSTALL_OVER_APP_ID_DRIFT/);

  assert.throws(() => createInstallOverDeviceEvidence({
    beforeInstalled: snapshot(1007),
    afterInstalled: snapshot(1008, { installedSignerCertificateSha256: 'd'.repeat(64) }),
    persistenceProbe: { key: 'probe', before: 'same', after: 'same' },
  }), /INSTALL_OVER_SIGNER_DRIFT/);
});
