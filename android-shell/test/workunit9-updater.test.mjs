import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateService } from '../app/public/logic/updates/update-service.mjs';

function fixture(overrides = {}) {
  const calls = [];
  const native = overrides.native ?? {
    startDownload: async input => (calls.push(['startDownload', input]), { jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => (calls.push(['getJobSnapshot', id]), { jobId:id, state:'READY_TO_INSTALL', bytesDownloaded:50, totalBytes:null, stagedPath:'/tmp/update.apk' }),
    pauseDownload: async id => (calls.push(['pauseDownload', id]), { jobId:id, state:'PAUSED' }),
    resumeDownload: async id => (calls.push(['resumeDownload', id]), { jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => (calls.push(['discardDownload', id]), { jobId:id, state:'CANCELLED' }),
    requestInstall: async id => (calls.push(['requestInstall', id]), { status:'REQUESTED' }),
    reconcileInstalledVersion: async () => ({ applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }),
  };
  const verifier = overrides.verifier ?? {
    inspect: async path => (calls.push(['inspect', path]), { sha256:'sha', applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }),
  };
  const backup = overrides.backup;
  const service = createUpdateService({ native, verifier, backup, expectedIdentity:{ applicationId:'com.yggdrasil.lighthouse', signerCertificateSha256:'signer', minVersionCode:1005, artifactSha256:'sha' } });
  return { service, calls };
}

test('start passes expected artifact digest into native download owner', async () => {
  const { service, calls } = fixture();
  await service.start({ url:'https://example.test/lighthouse.apk' });
  assert.deepEqual(calls[0], ['startDownload', { url:'https://example.test/lighthouse.apk', expectedSha256:'sha' }]);
});

test('unknown total never invents a percentage', async () => {
  const { service } = fixture();
  const snapshot = await service.snapshot('J1');
  assert.equal(snapshot.progress.percent, null);
  assert.equal(snapshot.progress.bytesDownloaded, 50);
});

test('update service accepts the native canonical READY_TO_INSTALL state for installer handoff', async () => {
  const { service, calls } = fixture();
  assert.equal((await service.install('J1')).status, 'REQUESTED');
  assert.deepEqual(calls.filter(x => ['getJobSnapshot','requestInstall'].includes(x[0])).map(x => x[0]), ['getJobSnapshot','requestInstall']);
});

test('legacy STAGED state is rejected instead of remaining a second installer lifecycle', async () => {
  const native = {
    startDownload: async () => ({ jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => ({ jobId:id, state:'STAGED', stagedPath:'/tmp/update.apk' }),
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async id => ({ status:'REQUESTED', jobId:id }),
    reconcileInstalledVersion: async () => null,
  };
  const { service } = fixture({ native });
  await assert.rejects(() => service.install('J1'), error => error?.code === 'UPDATE_JOB_NOT_READY_TO_INSTALL');
});

test('installer handoff resolves the staged path from the persisted native job', async () => {
  const { service, calls } = fixture();
  await service.install('J1');
  assert.deepEqual(calls.filter(x => ['getJobSnapshot','inspect','requestInstall'].includes(x[0])), [
    ['getJobSnapshot','J1'],
    ['inspect','/tmp/update.apk'],
    ['requestInstall','J1'],
  ]);
});

test('wrong signer or package blocks installer handoff', async () => {
  const { service, calls } = fixture({ verifier:{ inspect: async () => ({ sha256:'sha', applicationId:'evil.app', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'wrong' }) } });
  await assert.rejects(() => service.install('J1'), /UPDATE_IDENTITY_MISMATCH/);
  assert.equal(calls.some(x => x[0] === 'requestInstall'), false);
});

test('altered staged artifact blocks installer handoff', async () => {
  const { service, calls } = fixture({ verifier:{ inspect: async () => ({ sha256:'altered', applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }) } });
  await assert.rejects(() => service.install('J1'), /UPDATE_ARTIFACT_MISMATCH/);
  assert.equal(calls.some(x => x[0] === 'requestInstall'), false);
});

test('process-death recovery re-reads canonical ready job and re-inspects artifact', async () => {
  const calls = [];
  const native = {
    startDownload: async () => ({ jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => (calls.push(['getJobSnapshot', id]), { jobId:id, state:'READY_TO_INSTALL', bytesDownloaded:100, totalBytes:100, stagedPath:'/tmp/update.apk' }),
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async id => ({ status:'REQUESTED', jobId:id }),
    reconcileInstalledVersion: async () => null,
  };
  const verifier = {
    inspect: async path => (calls.push(['inspect', path]), { sha256:'sha', applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }),
  };
  const { service } = fixture({ native, verifier });
  const recovered = await service.recover('J1');
  assert.equal(recovered.state, 'READY_TO_INSTALL');
  assert.equal(recovered.stagedPath, '/tmp/update.apk');
  assert.deepEqual(calls.map(x => x[0]), ['getJobSnapshot','inspect']);
});

test('permission return resumes from durable PERMISSION_REQUIRED state and re-inspects staged artifact', async () => {
  const calls = [];
  let installAttempt = 0;
  let snapshotRead = 0;
  const native = {
    startDownload: async () => ({ jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => {
      calls.push(['getJobSnapshot', id]);
      snapshotRead += 1;
      return {
        jobId:id,
        state:snapshotRead === 1 ? 'READY_TO_INSTALL' : 'PERMISSION_REQUIRED',
        bytesDownloaded:100,
        totalBytes:100,
        stagedPath:'/tmp/update.apk',
      };
    },
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async id => {
      calls.push(['requestInstall', id]);
      installAttempt += 1;
      return installAttempt === 1 ? { status:'PERMISSION_REQUIRED' } : { status:'REQUESTED' };
    },
    reconcileInstalledVersion: async () => null,
  };
  const verifier = {
    inspect: async path => (calls.push(['inspect', path]), { sha256:'sha', applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }),
  };
  const { service } = fixture({ native, verifier });
  assert.equal((await service.install('J1')).status, 'PERMISSION_REQUIRED');
  assert.equal((await service.resumeInstallAfterPermission('J1')).status, 'REQUESTED');
  assert.deepEqual(calls, [
    ['getJobSnapshot','J1'], ['inspect','/tmp/update.apk'], ['requestInstall','J1'],
    ['getJobSnapshot','J1'], ['inspect','/tmp/update.apk'], ['requestInstall','J1'],
  ]);
});

test('installer handoff requires successful backup durable readback when backup owner is configured', async () => {
  const calls = [];
  const backup = {
    exportBackup: async () => (calls.push(['backup']), { revision:7, artifactHash:'backup-sha' }),
    readback: async artifact => (calls.push(['backupReadback', artifact.artifactHash]), { revision:7, artifactHash:'backup-sha' }),
  };
  const { service } = fixture({ backup, native:{
    startDownload: async () => ({ jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => (calls.push(['getJobSnapshot', id]), { jobId:id, state:'READY_TO_INSTALL', bytesDownloaded:100, totalBytes:100, stagedPath:'/tmp/update.apk' }),
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async id => (calls.push(['requestInstall', id]), { status:'REQUESTED' }),
    reconcileInstalledVersion: async () => null,
  }});
  assert.equal((await service.install('J1')).status, 'REQUESTED');
  assert.deepEqual(calls, [
    ['getJobSnapshot','J1'],
    ['backup'],
    ['backupReadback','backup-sha'],
    ['requestInstall','J1'],
  ]);
});

test('installed state is reconciled from PackageManager/native readback, not install request', async () => {
  const { service } = fixture();
  assert.equal((await service.install('J1')).status, 'REQUESTED');
  assert.deepEqual(await service.reconcileInstalled(), { applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' });
});

test('cancel delegates to native job owner', async () => {
  const { service, calls } = fixture();
  assert.equal((await service.cancel('J1')).state, 'CANCELLED');
  assert.deepEqual(calls.at(-1), ['discardDownload','J1']);
});
