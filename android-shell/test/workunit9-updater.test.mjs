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
  const service = createUpdateService({ native, verifier, expectedIdentity:{ applicationId:'com.yggdrasil.lighthouse', signerCertificateSha256:'signer', minVersionCode:1005, artifactSha256:'sha' } });
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
