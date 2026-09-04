import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createUpdateService } from '../app/public/logic/updates/update-service.mjs';

const nativeUrl = new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url);

function serviceFor(snapshot) {
  const native = {
    startDownload: async input => ({ jobId:'J1', state:'DOWNLOADING', ...input }),
    getJobSnapshot: async () => snapshot,
    pauseDownload: async () => ({ state:'PAUSED' }),
    resumeDownload: async () => ({ state:'DOWNLOADING' }),
    discardDownload: async () => ({ state:'CANCELLED' }),
    requestInstall: async () => ({ status:'REQUESTED' }),
    reconcileInstalledVersion: async () => ({ state:'DONE' }),
  };
  const verifier = { inspect: async () => ({}) };
  const backup = {
    exportBackup: async () => ({ revision:1, exportedAt:'2026-09-04T12:00:00.000Z', artifactHash:'backup' }),
    readback: async artifact => artifact,
  };
  return createUpdateService({
    native,
    verifier,
    backup,
    expectedIdentity:{ applicationId:'com.yggdrasil.lighthouse', signerCertificateSha256:'signer' },
  });
}

test('service exposes native rolling speed while keeping unknown total and percent truthful', async () => {
  const withSpeed = await serviceFor({ state:'DOWNLOADING', bytesDownloaded:4096, totalBytes:null, speedBps:2048 }).snapshot('J1');
  assert.deepEqual(withSpeed.progress, {
    bytesDownloaded:4096,
    totalBytes:null,
    percent:null,
    speedBps:2048,
  });

  const withoutSample = await serviceFor({ state:'DOWNLOADING', bytesDownloaded:1024, totalBytes:8192 }).snapshot('J1');
  assert.equal(withoutSample.progress.speedBps, null);
  assert.equal(withoutSample.progress.percent, 12.5);
});

test('native download speed is calculated from a rolling sample window and persisted only after enough samples', async () => {
  const source = await readFile(nativeUrl, 'utf8');
  assert.match(source, /speedBps/);
  assert.match(source, /ArrayDeque|Deque/);
  assert.match(source, /SPEED_SAMPLE_WINDOW_MS/);
  assert.match(source, /speedSamples\.size\(\)\s*<\s*2|speedSamples\.size\(\)\s*>=\s*2/);

  const checkpointStart = source.indexOf('if (now - lastCheckpointAt >= PROGRESS_CHECKPOINT_MS)');
  assert.ok(checkpointStart >= 0, 'missing throttled progress checkpoint');
  const checkpoint = source.slice(checkpointStart, source.indexOf('lastCheckpointAt = now;', checkpointStart) + 'lastCheckpointAt = now;'.length);
  assert.match(checkpoint, /speedBps/);
  assert.match(checkpoint, /save\(state\)/);
});

test('non-downloading transitions clear stale speed so snapshot never reports an old transfer rate', async () => {
  const source = await readFile(nativeUrl, 'utf8');
  const pauseStart = source.indexOf('public void pauseDownload');
  const pauseEnd = source.indexOf('@PluginMethod', pauseStart + 1);
  assert.match(source.slice(pauseStart, pauseEnd), /remove\("speedBps"\)/);

  const retryStart = source.indexOf('private boolean retryNetworkFailure');
  const retryEnd = source.indexOf('private boolean isRetryableNetworkError', retryStart);
  assert.match(source.slice(retryStart, retryEnd), /remove\("speedBps"\)/);

  const verifyTransition = source.slice(source.indexOf('done.put("state", "VERIFYING")') - 300, source.indexOf('completeVerification(jobId, part)'));
  assert.match(verifyTransition, /remove\("speedBps"\)/);

  const restartStart = source.indexOf('private boolean restartPartialFromZero');
  const restartEnd = source.indexOf('private void completeVerification', restartStart);
  assert.match(source.slice(restartStart, restartEnd), /remove\("speedBps"\)/);
});
