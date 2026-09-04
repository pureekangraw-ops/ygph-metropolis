function requireMethod(owner, name) {
  if (!owner || typeof owner[name] !== 'function') {
    throw new TypeError(`Missing required owner method: ${name}`);
  }
}

function normalizeHex(value) {
  return String(value ?? '').trim().toLowerCase();
}

function deriveProgress(snapshot) {
  const bytesDownloaded = Number(snapshot?.bytesDownloaded ?? 0);
  const totalBytes = Number(snapshot?.totalBytes);
  const rawSpeedBps = snapshot?.speedBps;
  const parsedSpeedBps = Number(rawSpeedBps);
  const speedBps = rawSpeedBps == null || !Number.isFinite(parsedSpeedBps) || parsedSpeedBps < 0
    ? null
    : parsedSpeedBps;

  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return { bytesDownloaded, totalBytes: null, percent: null, speedBps };
  }

  const raw = (bytesDownloaded / totalBytes) * 100;
  const percent = Math.max(0, Math.min(100, raw));
  return { bytesDownloaded, totalBytes, percent, speedBps };
}

export function createUpdateService({ native, verifier, backup, expectedIdentity } = {}) {
  for (const name of [
    'startDownload',
    'getJobSnapshot',
    'pauseDownload',
    'resumeDownload',
    'discardDownload',
    'requestInstall',
    'reconcileInstalledVersion',
  ]) requireMethod(native, name);
  requireMethod(verifier, 'inspect');
  requireMethod(backup, 'exportBackup');
  requireMethod(backup, 'readback');

  if (!expectedIdentity?.applicationId || !expectedIdentity?.signerCertificateSha256) {
    throw new TypeError('expectedIdentity applicationId and signerCertificateSha256 are required');
  }

  async function inspectForInstall(path, target = null) {
    const inspected = await verifier.inspect(path);
    const expectedArtifactSha = normalizeHex(expectedIdentity.artifactSha256);
    const actualArtifactSha = normalizeHex(inspected?.sha256);

    if (expectedArtifactSha && actualArtifactSha !== expectedArtifactSha) {
      const error = new Error('UPDATE_ARTIFACT_MISMATCH');
      error.code = 'UPDATE_ARTIFACT_MISMATCH';
      error.inspected = inspected;
      throw error;
    }

    const packageMatches = inspected?.applicationId === expectedIdentity.applicationId;
    const signerMatches = normalizeHex(inspected?.signerCertificateSha256) === normalizeHex(expectedIdentity.signerCertificateSha256);
    const minimum = Number(expectedIdentity.minVersionCode);
    const minimumMatches = !Number.isFinite(minimum) || Number(inspected?.versionCode) >= minimum;

    const targetVersionCode = Number(target?.targetVersionCode);
    const hasTargetVersionCode = Number.isFinite(targetVersionCode) && targetVersionCode > 0;
    const targetCodeMatches = !hasTargetVersionCode || Number(inspected?.versionCode) === targetVersionCode;
    const targetVersionName = String(target?.targetVersionName ?? '').trim();
    const targetNameMatches = !targetVersionName || String(inspected?.versionName ?? '') === targetVersionName;

    if (!packageMatches || !signerMatches || !minimumMatches || !targetCodeMatches || !targetNameMatches) {
      const error = new Error('UPDATE_IDENTITY_MISMATCH');
      error.code = 'UPDATE_IDENTITY_MISMATCH';
      error.inspected = inspected;
      error.targetVersionCode = hasTargetVersionCode ? targetVersionCode : null;
      error.targetVersionName = targetVersionName || null;
      throw error;
    }
    return inspected;
  }

  async function verifyPreinstallBackup() {
    const artifact = await backup.exportBackup();
    const readback = await backup.readback(artifact);
    const artifactHash = String(artifact?.artifactHash ?? '').trim();
    const exportedAt = String(artifact?.exportedAt ?? '').trim();
    if (
      !artifactHash ||
      !exportedAt ||
      readback?.artifactHash !== artifactHash ||
      readback?.revision !== artifact?.revision ||
      readback?.exportedAt !== exportedAt
    ) {
      const error = new Error('UPDATE_BACKUP_READBACK_FAILED');
      error.code = 'UPDATE_BACKUP_READBACK_FAILED';
      throw error;
    }
    return readback;
  }

  async function verifiedInstall(jobId, allowedStates) {
    const snapshot = await native.getJobSnapshot(jobId);
    if (!allowedStates.includes(snapshot?.state) || !snapshot?.stagedPath) {
      const error = new Error('UPDATE_JOB_NOT_READY_TO_INSTALL');
      error.code = 'UPDATE_JOB_NOT_READY_TO_INSTALL';
      error.snapshot = snapshot;
      throw error;
    }
    const inspected = await inspectForInstall(snapshot.stagedPath, snapshot);
    const backupReadback = await verifyPreinstallBackup();
    const result = await native.requestInstall(jobId);
    return { ...result, stagedIdentity: inspected, backupReadback };
  }

  return Object.freeze({
    async start(input) {
      const expectedSha256 = normalizeHex(expectedIdentity.artifactSha256);
      const { versionCode, versionName, ...downloadInput } = input ?? {};
      const nativeInput = { ...downloadInput, expectedSha256 };
      if (versionCode !== undefined) nativeInput.targetVersionCode = versionCode;
      if (versionName !== undefined) nativeInput.targetVersionName = versionName;
      return native.startDownload(nativeInput);
    },

    async snapshot(jobId) {
      const snapshot = await native.getJobSnapshot(jobId);
      return { ...snapshot, progress: deriveProgress(snapshot) };
    },

    async recover(jobId) {
      const snapshot = await native.getJobSnapshot(jobId);
      if (snapshot?.state === 'READY_TO_INSTALL' && snapshot?.stagedPath) {
        const inspected = await inspectForInstall(snapshot.stagedPath, snapshot);
        return {
          ...snapshot,
          stagedIdentity: inspected,
          progress: deriveProgress(snapshot),
        };
      }
      return { ...snapshot, progress: deriveProgress(snapshot) };
    },

    async pause(jobId) {
      return native.pauseDownload(jobId);
    },

    async resume(jobId) {
      return native.resumeDownload(jobId);
    },

    async cancel(jobId) {
      return native.discardDownload(jobId);
    },

    async install(jobId) {
      return verifiedInstall(jobId, ['READY_TO_INSTALL']);
    },

    async resumeInstallAfterPermission(jobId) {
      return verifiedInstall(jobId, ['READY_TO_INSTALL']);
    },

    async reconcileInstalled(jobId) {
      return native.reconcileInstalledVersion(jobId);
    },
  });
}
