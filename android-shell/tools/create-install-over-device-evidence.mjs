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
  if (!value || typeof value !== 'object' || !value.key || value.before === undefined || value.after === undefined) {
    throw new Error('INSTALL_OVER_PERSISTENCE_PROBE_REQUIRED');
  }
  return value;
}

export function createInstallOverDeviceEvidence({
  beforeInstalled,
  afterInstalled,
  persistenceProbe,
  launchedAfterInstall = false,
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

  return Object.freeze({
    installMode: 'INSTALL_OVER',
    installedApplicationId: after.installedApplicationId,
    installedSignerCertificateSha256: after.installedSignerCertificateSha256,
    installedApkSha256: after.apkSha256,
    beforeVersionCode: before.versionCode,
    afterVersionCode: after.versionCode,
    launchedAfterInstall: launchedAfterInstall === true,
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
  launchedAfterInstall = false,
} = {}) {
  if (!beforeInstalledPath || !afterInstalledPath || !persistenceProbePath) {
    throw new Error('INSTALL_OVER_EVIDENCE_PATHS_REQUIRED');
  }
  const [beforeInstalled, afterInstalled, persistenceProbe] = await Promise.all([
    readJson(beforeInstalledPath),
    readJson(afterInstalledPath),
    readJson(persistenceProbePath),
  ]);
  return createInstallOverDeviceEvidence({
    beforeInstalled,
    afterInstalled,
    persistenceProbe,
    launchedAfterInstall,
  });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const result = await createInstallOverDeviceEvidenceFromFiles({
    beforeInstalledPath: process.argv[2],
    afterInstalledPath: process.argv[3],
    persistenceProbePath: process.argv[4],
    launchedAfterInstall: process.argv.includes('--launched-after-install'),
  });
  console.log(JSON.stringify(result, null, 2));
}
