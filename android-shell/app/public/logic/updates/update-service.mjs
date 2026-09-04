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

  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return { bytesDownloaded, totalBytes: null, percent: null };
  }

  const raw = (bytesDownloaded / totalBytes) * 100;
  const percent = Math.max(0, Math.min(100, raw));
  return { bytesDownloaded, totalBytes, percent };
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
  if (backup) {
    requireMethod(backup, 'exportBackup');
    requireMethod(backup, 'readback');
  }

  if (!expectedIdentity?.applicationId || !expectedIdentity?.signerCertificateSha256) {
    throw new TypeError('expectedIdentity applicationId and signerCertificateSha256 are required');
  }

  async function inspectForInstall(path) {
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
    const versionMatches = !Number.isFinite(minimum) || Number(inspected?.versionCode) >= minimum;

    if (!packageMatches || !signerMatches || !versionMatches) {
      const error = new Error('UPDATE_IDENTITY_MISMATCH');
      error.code = 'UPDATE_IDENTITY_MISMATCH';
      error.inspected = inspected;
      throw error;
    }
    return inspected;
  }

  async function verifyPreinstallBackup() {
    if (!backup) return null;
    const artifact = await backup.exportBackup();
    const readback = await backup.readback(artifact);
    if (!artifact?.artifactHash || readback?.artifactHash !== artifact.artifactHash || readback?.revision !== artifact.revision) {
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
    const inspected = await inspectForInstall(snapshot.stagedPath);
    const backupReadback = await verifyPreinstallBackup();
    const result = await native.requestInstall(jobId);
    return { ...result, stagedIdentity: inspected, ...(backupReadback ? { backupReadback } : {}) };
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
        const inspected = await inspectForInstall(snapshot.stagedPath);
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
      return verifiedInstall(jobId, ['PERMISSION_REQUIRED']);
    },

    async reconcileInstalled(jobId) {
      return native.reconcileInstalledVersion(jobId);
    },
  });
}
