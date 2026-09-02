import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateController } from '../src/update-controller.mjs';

const manifest = Object.freeze({
  versionName:'2.0.2',
  versionCode:2002,
  packageName:'com.yggdrasil.lighthouse',
  apkUrl:'https://github.com/pureekangraw-ops/ygph-metropolis/releases/download/lighthouse-2.0.2/LIGHTHOUSE-2.0.2.apk',
  sha256:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  sizeBytes:3000000,
  releaseNotes:'Updater acceptance target',
});

function bridge(overrides = {}) {
  const calls = [];
  return {
    calls,
    async fetchManifest(){ calls.push('fetchManifest'); return manifest; },
    async getInstalledIdentity(){ calls.push('getInstalledIdentity'); return { packageName:'com.yggdrasil.lighthouse', versionName:'2.0.1', versionCode:2001 }; },
    async enqueueDownload(input){ calls.push(['enqueueDownload', input]); return { state:'Downloading', downloadedBytes:0, totalBytes:input.sizeBytes }; },
    async readDownloadState(){ calls.push('readDownloadState'); return { state:'Paused', downloadedBytes:750, totalBytes:1000 }; },
    async retryDownload(){ calls.push('retryDownload'); return { state:'Retrying', downloadedBytes:750, totalBytes:1000 }; },
    async verifyDownloadedApk(){ calls.push('verifyDownloadedApk'); return { ok:true }; },
    async canInstallPackages(){ calls.push('canInstallPackages'); return { allowed:true }; },
    async requestInstallPermission(){ calls.push('requestInstallPermission'); return { opened:true }; },
    async installDownloadedApk(){ calls.push('installDownloadedApk'); return { state:'Installing' }; },
    async reconcileInstalledVersion(){ calls.push('reconcileInstalledVersion'); return { packageName:'com.yggdrasil.lighthouse', versionName:'2.0.2', versionCode:2002 }; },
    async cancelUpdate(input){ calls.push(['cancelUpdate', input]); return { cancelled:true }; },
    ...overrides,
  };
}

test('checkUpdate reports candidate only when manifest versionCode is higher than installed reality', async () => {
  const native = bridge();
  const controller = createUpdateController({
    bridge:native,
    manifestUrl:'https://raw.githubusercontent.com/pureekangraw-ops/ygph-metropolis/test-manifest/update-test/manifest.json',
    packageName:'com.yggdrasil.lighthouse',
  });
  const status = await controller.checkUpdate();
  assert.equal(status.state, 'update-available');
  assert.equal(status.installed.versionCode, 2001);
  assert.equal(status.candidate.versionCode, 2002);
  assert.equal(status.canUpdate, true);
});

test('checkUpdate refuses same version and downgrade without starting a download', async () => {
  const same = bridge({ async fetchManifest(){ return { ...manifest, versionCode:2001, versionName:'2.0.1' }; } });
  const sameController = createUpdateController({ bridge:same, manifestUrl:'https://example.com/test.json', packageName:'com.yggdrasil.lighthouse' });
  assert.equal((await sameController.checkUpdate()).state, 'up-to-date');
  assert.equal(same.calls.some(call => Array.isArray(call) && call[0] === 'enqueueDownload'), false);

  const lower = bridge({ async fetchManifest(){ return { ...manifest, versionCode:2000, versionName:'2.0.0' }; } });
  const lowerController = createUpdateController({ bridge:lower, manifestUrl:'https://example.com/test.json', packageName:'com.yggdrasil.lighthouse' });
  assert.equal((await lowerController.checkUpdate()).state, 'rejected-downgrade');
  assert.equal(lower.calls.some(call => Array.isArray(call) && call[0] === 'enqueueDownload'), false);
});

test('download lifecycle exposes real progress, verification, permission, install and readback', async () => {
  const native = bridge();
  const controller = createUpdateController({ bridge:native, manifestUrl:'https://example.com/test.json', packageName:'com.yggdrasil.lighthouse' });
  await controller.checkUpdate();
  assert.equal((await controller.startUpdate()).state, 'Downloading');
  const paused = await controller.readStatus();
  assert.equal(paused.state, 'Paused');
  assert.equal(paused.progress.percent, 75);
  assert.equal((await controller.retry()).state, 'Retrying');
  assert.equal((await controller.verify()).state, 'Ready to install');
  assert.equal((await controller.install()).state, 'Installing');
  const reconciled = await controller.reconcile();
  assert.equal(reconciled.state, 'updated-successfully');
  assert.equal(reconciled.installed.versionCode, 2002);
});

test('unknown-source permission opens Android settings and keeps updater resumable', async () => {
  const native = bridge({ async canInstallPackages(){ return { allowed:false }; } });
  const controller = createUpdateController({ bridge:native, manifestUrl:'https://example.com/test.json', packageName:'com.yggdrasil.lighthouse' });
  await controller.checkUpdate();
  await controller.startUpdate();
  await controller.verify();
  const status = await controller.install();
  assert.equal(status.state, 'permission-required');
  assert.equal(native.calls.includes('requestInstallPermission'), true);
});

test('verification failure is surfaced as Failed and permanent cancel deletes staged work', async () => {
  const native = bridge({ async verifyDownloadedApk(){ return { ok:false, reason:'signer-mismatch', message:'ไฟล์อัปเดตไม่ได้มาจากผู้ลงนามเดิม' }; } });
  const controller = createUpdateController({ bridge:native, manifestUrl:'https://example.com/test.json', packageName:'com.yggdrasil.lighthouse' });
  await controller.checkUpdate();
  await controller.startUpdate();
  const failed = await controller.verify();
  assert.equal(failed.state, 'Failed');
  assert.match(failed.message, /ผู้ลงนามเดิม/);
  await controller.cancel({ permanent:true });
  assert.deepEqual(native.calls.at(-1), ['cancelUpdate', { permanent:true }]);
});

test('restore rebuilds updater state from persisted native download metadata after process interruption', async () => {
  const native = bridge({
    async readDownloadState(){
      return {
        state:'Downloading',
        downloadedBytes:1024,
        totalBytes:-1,
        candidate:manifest,
      };
    },
  });
  const controller = createUpdateController({ bridge:native, manifestUrl:'https://example.com/test.json', packageName:'com.yggdrasil.lighthouse' });
  const restored = await controller.restore();
  assert.equal(restored.state, 'Downloading');
  assert.equal(restored.candidate.versionCode, 2002);
  assert.equal(restored.installed.versionCode, 2001);
  assert.equal(restored.progress.indeterminate, true);
  assert.equal(restored.progress.percent, null);
});
