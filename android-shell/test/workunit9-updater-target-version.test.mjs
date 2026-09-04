import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateService } from '../app/public/logic/updates/update-service.mjs';

function fixture(inspected) {
  const calls = [];
  const native = {
    startDownload: async input => ({ jobId:'J1', state:'DOWNLOADING', ...input }),
    getJobSnapshot: async id => ({
      jobId:id,
      state:'READY_TO_INSTALL',
      stagedPath:'/tmp/update.apk',
      targetVersionCode:1005,
      targetVersionName:'1.0.0',
    }),
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async id => (calls.push(['requestInstall', id]), { status:'REQUESTED' }),
    reconcileInstalledVersion: async id => ({ jobId:id, state:'DONE' }),
  };
  const verifier = {
    inspect: async path => (calls.push(['inspect', path]), inspected),
  };
  const service = createUpdateService({
    native,
    verifier,
    expectedIdentity:{
      applicationId:'com.yggdrasil.lighthouse',
      signerCertificateSha256:'signer',
      minVersionCode:1004,
      artifactSha256:'sha',
    },
  });
  return { service, calls };
}

function artifact(overrides = {}) {
  return {
    sha256:'sha',
    applicationId:'com.yggdrasil.lighthouse',
    signerCertificateSha256:'signer',
    versionCode:1005,
    versionName:'1.0.0',
    ...overrides,
  };
}

test('installer rejects staged APK whose versionCode is newer but not the durable job target', async () => {
  const { service, calls } = fixture(artifact({ versionCode:1006, versionName:'1.0.1' }));
  await assert.rejects(() => service.install('J1'), error => error?.code === 'UPDATE_IDENTITY_MISMATCH');
  assert.equal(calls.some(([name]) => name === 'requestInstall'), false);
});

test('installer rejects staged APK whose versionName does not match the durable job target', async () => {
  const { service, calls } = fixture(artifact({ versionName:'1.0.0-other' }));
  await assert.rejects(() => service.install('J1'), error => error?.code === 'UPDATE_IDENTITY_MISMATCH');
  assert.equal(calls.some(([name]) => name === 'requestInstall'), false);
});

test('installer accepts staged APK only when package signer artifact and target version all match', async () => {
  const { service, calls } = fixture(artifact());
  assert.equal((await service.install('J1')).status, 'REQUESTED');
  assert.deepEqual(calls, [['inspect','/tmp/update.apk'], ['requestInstall','J1']]);
});
