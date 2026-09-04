import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateService } from '../app/public/logic/updates/update-service.mjs';

function nativeFixture(calls = []) {
  return {
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
}

const verifier = {
  inspect: async () => ({
    sha256:'sha',
    applicationId:'com.yggdrasil.lighthouse',
    versionName:'1.0.0',
    versionCode:1005,
    signerCertificateSha256:'signer',
  }),
};

const expectedIdentity = {
  applicationId:'com.yggdrasil.lighthouse',
  signerCertificateSha256:'signer',
  minVersionCode:1005,
  artifactSha256:'sha',
};

test('update service requires a backup owner because installer handoff may never bypass encrypted backup readback', () => {
  assert.throws(
    () => createUpdateService({ native:nativeFixture(), verifier, expectedIdentity }),
    /Missing required owner method: exportBackup/,
  );
});

test('backup readback must match revision exportedAt and artifactHash before installer handoff', async () => {
  const calls = [];
  const backup = {
    exportBackup: async () => ({ revision:7, exportedAt:'2026-09-04T11:00:00.000Z', artifactHash:'backup-sha' }),
    readback: async artifact => ({
      revision:artifact.revision,
      exportedAt:'2026-09-04T11:00:01.000Z',
      artifactHash:artifact.artifactHash,
    }),
  };
  const service = createUpdateService({ native:nativeFixture(calls), verifier, backup, expectedIdentity });

  await assert.rejects(
    () => service.install('J1'),
    error => error?.code === 'UPDATE_BACKUP_READBACK_FAILED',
  );
  assert.equal(calls.some(([name]) => name === 'requestInstall'), false);
});
