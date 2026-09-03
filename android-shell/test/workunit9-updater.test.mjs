import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateService } from '../app/public/logic/updates/update-service.mjs';

function fixture(overrides = {}) {
  const calls = [];
  const native = overrides.native ?? {
    startDownload: async input => (calls.push(['startDownload', input]), { jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async () => ({ jobId:'J1', state:'DOWNLOADING', bytesDownloaded:50, totalBytes:null, stagedPath:'/tmp/update.part' }),
    pauseDownload: async id => (calls.push(['pauseDownload', id]), { jobId:id, state:'PAUSED' }),
    resumeDownload: async id => (calls.push(['resumeDownload', id]), { jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => (calls.push(['discardDownload', id]), { jobId:id, state:'CANCELLED' }),
    requestInstall: async path => (calls.push(['requestInstall', path]), { status:'REQUESTED' }),
    reconcileInstalledVersion: async () => ({ applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }),
  };
  const verifier = overrides.verifier ?? {
    inspect: async path => (calls.push(['inspect', path]), { sha256:'sha', applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }),
  };
  const backup = overrides.backup;
  const service = createUpdateService({ native, verifier, backup, expectedIdentity:{ applicationId:'com.yggdrasil.lighthouse', signerCertificateSha256:'signer', minVersionCode:1005, artifactSha256:'sha' } });
  return { service, calls };
}

test('unknown total never invents a percentage', async () => {
  const { service } = fixture();
  const snapshot = await service.snapshot('J1');
  assert.equal(snapshot.progress.percent, null);
  assert.equal(snapshot.progress.bytesDownloaded, 50);
});

test('resume re-inspects staged artifact before installer handoff', async () => {
  const { service, calls } = fixture();
  await service.resume('J1');
  await service.install('/tmp/update.apk');
  assert.deepEqual(calls.filter(x => ['inspect','requestInstall'].includes(x[0])).map(x => x[0]), ['inspect','requestInstall']);
});

test('wrong signer or package blocks installer handoff', async () => {
  const { service, calls } = fixture({ verifier:{ inspect: async () => ({ sha256:'sha', applicationId:'evil.app', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'wrong' }) } });
  await assert.rejects(() => service.install('/tmp/update.apk'), /UPDATE_IDENTITY_MISMATCH/);
  assert.equal(calls.some(x => x[0] === 'requestInstall'), false);
});

test('altered staged artifact blocks installer handoff', async () => {
  const { service, calls } = fixture({ verifier:{ inspect: async () => ({ sha256:'altered', applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }) } });
  await assert.rejects(() => service.install('/tmp/update.apk'), /UPDATE_ARTIFACT_MISMATCH/);
  assert.equal(calls.some(x => x[0] === 'requestInstall'), false);
});

test('process-death recovery re-reads native staged job and re-inspects artifact', async () => {
  const calls = [];
  const native = {
    startDownload: async () => ({ jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => (calls.push(['getJobSnapshot', id]), { jobId:id, state:'STAGED', bytesDownloaded:100, totalBytes:100, stagedPath:'/tmp/update.apk' }),
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async path => ({ status:'REQUESTED', path }),
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

test('permission return re-inspects staged artifact before retrying installer', async () => {
  const calls = [];
  let attempt = 0;
  const native = {
    startDownload: async () => ({ jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => ({ jobId:id, state:'STAGED', bytesDownloaded:100, totalBytes:100, stagedPath:'/tmp/update.apk' }),
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async path => {
      calls.push(['requestInstall', path]);
      attempt += 1;
      return attempt === 1 ? { status:'PERMISSION_REQUIRED' } : { status:'REQUESTED' };
    },
    reconcileInstalledVersion: async () => null,
  };
  const verifier = {
    inspect: async path => (calls.push(['inspect', path]), { sha256:'sha', applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' }),
  };
  const { service } = fixture({ native, verifier });
  assert.equal((await service.install('/tmp/update.apk')).status, 'PERMISSION_REQUIRED');
  assert.equal((await service.resumeInstallAfterPermission('/tmp/update.apk')).status, 'REQUESTED');
  assert.deepEqual(calls.map(x => x[0]), ['inspect','requestInstall','inspect','requestInstall']);
});

test('installer handoff requires successful backup durable readback when backup owner is configured', async () => {
  const calls = [];
  const backup = {
    exportBackup: async () => (calls.push(['backup']), { revision:7, artifactHash:'backup-sha' }),
    readback: async artifact => (calls.push(['backupReadback', artifact.artifactHash]), { revision:7, artifactHash:'backup-sha' }),
  };
  const { service } = fixture({ backup, native:{
    startDownload: async () => ({ jobId:'J1', state:'DOWNLOADING' }),
    getJobSnapshot: async id => ({ jobId:id, state:'STAGED', bytesDownloaded:100, totalBytes:100, stagedPath:'/tmp/update.apk' }),
    pauseDownload: async id => ({ jobId:id, state:'PAUSED' }),
    resumeDownload: async id => ({ jobId:id, state:'DOWNLOADING' }),
    discardDownload: async id => ({ jobId:id, state:'CANCELLED' }),
    requestInstall: async path => (calls.push(['requestInstall', path]), { status:'REQUESTED' }),
    reconcileInstalledVersion: async () => null,
  }});
  assert.equal((await service.install('/tmp/update.apk')).status, 'REQUESTED');
  assert.deepEqual(calls.map(x => x[0]), ['backup','backupReadback','requestInstall']);
});

test('installed state is reconciled from PackageManager/native readback, not install request', async () => {
  const { service } = fixture();
  assert.equal((await service.install('/tmp/update.apk')).status, 'REQUESTED');
  assert.deepEqual(await service.reconcileInstalled(), { applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'signer' });
});

test('cancel delegates to native job owner', async () => {
  const { service, calls } = fixture();
  assert.equal((await service.cancel('J1')).state, 'CANCELLED');
  assert.deepEqual(calls.at(-1), ['discardDownload','J1']);
});
