import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstallOverDeviceEvidence } from '../tools/create-install-over-device-evidence.mjs';

const signer = 'aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce';

function snapshot(versionCode) {
  return {
    source: 'ADB_INSTALLED_APK',
    installedApplicationId: 'com.yggdrasil.lighthouse',
    installedSignerCertificateSha256: signer,
    versionCode,
    versionName: versionCode === 1007 ? '1.0.0-owner.2' : '1.0.0-owner.3',
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
    launchedAfterInstall: true,
  });

  assert.equal(result.installMode, 'INSTALL_OVER');
  assert.equal(result.installedApplicationId, 'com.yggdrasil.lighthouse');
  assert.equal(result.beforeVersionCode, 1007);
  assert.equal(result.afterVersionCode, 1008);
  assert.equal(result.readbackVersionCode, 1008);
  assert.equal(result.launchedAfterInstall, true);
});

test('does not invent post-install launch evidence', () => {
  const result = createInstallOverDeviceEvidence({
    beforeInstalled: snapshot(1007),
    afterInstalled: snapshot(1008),
    persistenceProbe: { key: 'probe', before: 'same', after: 'same' },
  });
  assert.equal(result.launchedAfterInstall, false);
});

test('rejects snapshots from different app identities before acceptance evaluation', () => {
  assert.throws(() => createInstallOverDeviceEvidence({
    beforeInstalled: snapshot(1007),
    afterInstalled: { ...snapshot(1008), installedApplicationId: 'other.app' },
    persistenceProbe: { key: 'probe', before: 'same', after: 'same' },
  }), /INSTALL_OVER_APP_ID_DRIFT/);
});
