import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAndroidInstallAcceptance } from '../../lighthouse-next/update/android-install-acceptance.mjs';

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

export async function evaluateInstallOverFiles({
  versionPath = new URL('../version.json', import.meta.url),
  identityPath = new URL('../apk-identity.json', import.meta.url),
  staticEvidencePath,
  deviceEvidencePath,
} = {}) {
  const version = JSON.parse(await readFile(versionPath, 'utf8'));
  const identity = JSON.parse(await readFile(identityPath, 'utf8'));
  const staticEvidence = staticEvidencePath ? await readJson(staticEvidencePath) : undefined;
  const deviceEvidence = deviceEvidencePath ? await readJson(deviceEvidencePath) : undefined;

  return evaluateAndroidInstallAcceptance({
    expected: {
      applicationId: identity.applicationId,
      signerCertificateSha256: identity.signerCertificateSha256,
      baselineVersionCode: version.baselineVersionCode,
      targetVersionCode: version.versionCode,
      targetVersionName: version.versionName,
    },
    staticEvidence,
    deviceEvidence,
  });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const result = await evaluateInstallOverFiles({
    staticEvidencePath: process.argv[2],
    deviceEvidencePath: process.argv[3],
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'FAIL') process.exitCode = 1;
  else if (result.status === 'VERIFY') process.exitCode = 2;
}
