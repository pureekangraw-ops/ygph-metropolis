import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateService } from '../app/public/logic/updates/update-service.mjs';

function createFixture() {
  const calls = [];
  const native = {
    startDownload: async input => (calls.push(input), { jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => ({ jobId:id, state:'READY_TO_INSTALL', stagedPath:'/tmp/update.apk' }),
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async id => ({ status:'REQUESTED', jobId:id }),
    reconcileInstalledVersion: async id => (calls.push(['reconcileInstalledVersion', id]), { jobId:id, state:'DONE', installedVersionCode:1006 }),
  };
  const verifier = {
    inspect: async () => ({
      sha256:'sha',
      applicationId:'com.yggdrasil.lighthouse',
      versionName:'1.0.5',
      versionCode:1006,
      signerCertificateSha256:'signer',
    }),
  };
  const service = createUpdateService({
    native,
    verifier,
    expectedIdentity:{
      applicationId:'com.yggdrasil.lighthouse',
      signerCertificateSha256:'signer',
      minVersionCode:1005,
      artifactSha256:'sha',
    },
  });
  return { service, calls };
}

test('update service maps candidate version identity to native durable target fields', async () => {
  const { service, calls } = createFixture();
  await service.start({
    url:'https://example.test/lighthouse.apk',
    versionCode:1006,
    versionName:'1.0.5',
  });
  assert.deepEqual(calls[0], {
    url:'https://example.test/lighthouse.apk',
    expectedSha256:'sha',
    targetVersionCode:1006,
    targetVersionName:'1.0.5',
  });
});

test('installed readback bridge preserves updater job identity', async () => {
  const { service, calls } = createFixture();
  const result = await service.reconcileInstalled('J1');
  assert.deepEqual(result, { jobId:'J1', state:'DONE', installedVersionCode:1006 });
  assert.deepEqual(calls, [['reconcileInstalledVersion', 'J1']]);
});
