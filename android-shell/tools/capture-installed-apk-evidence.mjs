import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  parseAaptBadging,
  parseApksignerCertificateSha256,
} from './verify-apk-identity.mjs';

function defaultRunner(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolveRun({ status: null, stdout, stderr: String(error?.message ?? error) }));
    child.on('close', code => resolveRun({ status: code, stdout, stderr }));
  });
}

function assertRun(result, command) {
  if (!result || result.status !== 0) {
    const detail = String(result?.stderr || result?.stdout || '').trim();
    throw new Error(`ADB_EVIDENCE_TOOL_FAILED:${command}:${detail}`);
  }
  return result;
}

export function parsePmPath(output) {
  const paths = String(output ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('package:'))
    .map(line => line.slice('package:'.length).trim())
    .filter(Boolean);
  if (paths.length === 0) throw new Error('ADB_PACKAGE_PATH_MISSING');
  return paths.find(path => /\/base\.apk$/i.test(path)) ?? paths[0];
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function captureInstalledApkEvidence({
  applicationId,
  adb = 'adb',
  apksigner = process.env.APKSIGNER || 'apksigner',
  aapt = process.env.AAPT || 'aapt',
  runner = defaultRunner,
  tempRoot = tmpdir(),
  capturedAt = new Date().toISOString(),
} = {}) {
  const appId = String(applicationId ?? '').trim();
  if (!appId) throw new TypeError('ADB_EVIDENCE_APPLICATION_ID_REQUIRED');

  const pathResult = assertRun(
    await runner(adb, ['shell', 'pm', 'path', appId]),
    `${adb} shell pm path`,
  );
  const remoteApkPath = parsePmPath(pathResult.stdout);

  const workRoot = await mkdtemp(join(tempRoot, 'lighthouse-installed-apk-'));
  const localApkPath = join(workRoot, 'installed-base.apk');

  try {
    assertRun(await runner(adb, ['pull', remoteApkPath, localApkPath]), `${adb} pull`);
    const [apkBytes, signerResult, badgingResult] = await Promise.all([
      readFile(localApkPath),
      runner(apksigner, ['verify', '--print-certs', localApkPath]),
      runner(aapt, ['dump', 'badging', localApkPath]),
    ]);
    assertRun(signerResult, apksigner);
    assertRun(badgingResult, aapt);

    const badging = parseAaptBadging(badgingResult.stdout);
    if (badging.applicationId !== appId) throw new Error('ADB_EVIDENCE_APP_ID_MISMATCH');

    return Object.freeze({
      source: 'ADB_INSTALLED_APK',
      capturedAt,
      remoteApkPath,
      installedApplicationId: badging.applicationId,
      installedSignerCertificateSha256: parseApksignerCertificateSha256(signerResult.stdout),
      versionCode: badging.versionCode,
      versionName: badging.versionName,
      apkSha256: sha256(apkBytes),
    });
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const applicationId = process.argv[2] || 'com.yggdrasil.lighthouse';
  const evidence = await captureInstalledApkEvidence({ applicationId });
  console.log(JSON.stringify(evidence, null, 2));
}
