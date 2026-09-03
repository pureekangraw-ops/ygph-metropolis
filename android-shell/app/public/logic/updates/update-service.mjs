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

export function createUpdateService({ native, verifier, expectedIdentity } = {}) {
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

  async function verifiedInstall(path) {
    const inspected = await inspectForInstall(path);
    const result = await native.requestInstall(path);
    return { ...result, stagedIdentity: inspected };
  }

  return Object.freeze({
    async start(input) {
      return native.startDownload(input);
    },

    async snapshot(jobId) {
      const snapshot = await native.getJobSnapshot(jobId);
      return { ...snapshot, progress: deriveProgress(snapshot) };
    },

    async recover(jobId) {
      const snapshot = await native.getJobSnapshot(jobId);
      if (snapshot?.state === 'STAGED' && snapshot?.stagedPath) {
        const inspected = await inspectForInstall(snapshot.stagedPath);
        return {
          ...snapshot,
          state: 'READY_TO_INSTALL',
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

    async install(path) {
      return verifiedInstall(path);
    },

    async resumeInstallAfterPermission(path) {
      return verifiedInstall(path);
    },

    async reconcileInstalled() {
      return native.reconcileInstalledVersion();
    },
  });
}
