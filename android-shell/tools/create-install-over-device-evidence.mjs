import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function requireSnapshot(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`INSTALL_OVER_${label}_SNAPSHOT_REQUIRED`);
  for (const key of ['installedApplicationId', 'installedSignerCertificateSha256', 'versionCode', 'apkSha256']) {
    if (value[key] === undefined || value[key] === null || value[key] === '') {
      throw new Error(`INSTALL_OVER_${label}_SNAPSHOT_INCOMPLETE`);
    }
  }
  return value;
}

function requireProbe(value) {
  if (!value || typeof value !== 'object' || value.key !== 'GREENFIELD_DATABASE_VAULT_SHA256' ||
      !/^sha256:[0-9a-f]{64}$/i.test(String(value.before || '')) ||
      !/^sha256:[0-9a-f]{64}$/i.test(String(value.after || ''))) {
    throw new Error('INSTALL_OVER_PERSISTENCE_PROBE_INVALID');
  }
  return value;
}

function requireLaunchEvidence(value, applicationId) {
  if (!value || typeof value !== 'object') throw new Error('INSTALL_OVER_LAUNCH_EVIDENCE_REQUIRED');
  if (value.source !== 'ADB_AM_START_WAIT' || value.launched !== true) {
    throw new Error('INSTALL_OVER_LAUNCH_EVIDENCE_INVALID');
  }
  if (String(value.applicationId || '') !== String(applicationId || '')) {
    throw new Error('INSTALL_OVER_LAUNCH_APP_ID_MISMATCH');
  }
  if (!String(value.component || '').startsWith(`${applicationId}/`)) {
    throw new Error('INSTALL_OVER_LAUNCH_COMPONENT_MISMATCH');
  }
  if (!/^\d+$/.test(String(value.processId || ''))) {
    throw new Error('INSTALL_OVER_LAUNCH_PROCESS_MISSING');
  }
  if (!value.capturedAt || !Number.isFinite(Date.parse(String(value.capturedAt)))) {
    throw new Error('INSTALL_OVER_LAUNCH_CAPTURE_TIME_INVALID');
  }
  return value;
}

export function createInstallOverDeviceEvidence({
  beforeInstalled,
  afterInstalled,
  persistenceProbe,
  launchEvidence,
} = {}) {
  const before = requireSnapshot(beforeInstalled, 'BEFORE');
  const after = requireSnapshot(afterInstalled, 'AFTER');
  const probe = requireProbe(persistenceProbe);

  if (before.installedApplicationId !== after.installedApplicationId) {
    throw new Error('INSTALL_OVER_APP_ID_DRIFT');
  }
  if (String(before.installedSignerCertificateSha256).toLowerCase() !== String(after.installedSignerCertificateSha256).toLowerCase()) {
    throw new Error('INSTALL_OVER_SIGNER_DRIFT');
  }
  const launch = requireLaunchEvidence(launchEvidence, after.installedApplicationId);

  return Object.freeze({
    installMode: 'INSTALL_OVER',
    installedApplicationId: after.installedApplicationId,
    installedSignerCertificateSha256: after.installedSignerCertificateSha256,
    installedApkSha256: after.apkSha256,
    beforeVersionCode: before.versionCode,
    afterVersionCode: after.versionCode,
    afterVersionName: after.versionName,
    launchedAfterInstall: true,
    launchEvidence: Object.freeze({ ...launch }),
    readbackVersionCode: after.versionCode,
    persistenceProbe: Object.freeze({ ...probe }),
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

export async function createInstallOverDeviceEvidenceFromFiles({
  beforeInstalledPath,
  afterInstalledPath,
  persistenceProbePath,
  launchEvidencePath,
} = {}) {
  if (!beforeInstalledPath || !afterInstalledPath || !persistenceProbePath || !launchEvidencePath) {
    throw new Error('INSTALL_OVER_EVIDENCE_PATHS_REQUIRED');
  }
  const [beforeInstalled, afterInstalled, persistenceProbe, launchEvidence] = await Promise.all([
    readJson(beforeInstalledPath),
    readJson(afterInstalledPath),
    readJson(persistenceProbePath),
    readJson(launchEvidencePath),
  ]);
  return createInstallOverDeviceEvidence({
    beforeInstalled,
    afterInstalled,
    persistenceProbe,
    launchEvidence,
  });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const result = await createInstallOverDeviceEvidenceFromFiles({
    beforeInstalledPath: process.argv[2],
    afterInstalledPath: process.argv[3],
    persistenceProbePath: process.argv[4],
    launchEvidencePath: process.argv[5],
  });
  console.log(JSON.stringify(result, null, 2));
}
