import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function normalizeFingerprint(value) {
  return String(value ?? '').toLowerCase().replace(/[^0-9a-f]/g, '');
}

export function parseApksignerCertificateSha256(output) {
  const match = String(output).match(/certificate SHA-256 digest:\s*([^\r\n]+)/i);
  if (!match) throw new Error('APK_SIGNER_FINGERPRINT_MISSING');
  const fingerprint = normalizeFingerprint(match[1]);
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('APK_SIGNER_FINGERPRINT_INVALID');
  return fingerprint;
}

export function parseAaptBadging(output) {
  const text = String(output);
  const match = text.match(/package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/);
  if (!match) throw new Error('APK_BADGING_PARSE_FAILED');
  const versionCode = Number(match[2]);
  if (!Number.isInteger(versionCode) || versionCode <= 0) throw new Error('APK_VERSION_CODE_INVALID');
  return { applicationId: match[1], versionCode, versionName: match[3] };
}

export function assertApkIdentity(actual, expected) {
  if (actual.applicationId !== expected.applicationId) throw new Error('APK_APPLICATION_ID_MISMATCH');
  if (normalizeFingerprint(actual.signerCertificateSha256) !== normalizeFingerprint(expected.signerCertificateSha256)) throw new Error('APK_SIGNER_MISMATCH');
  if (actual.versionCode !== expected.versionCode) throw new Error('APK_VERSION_CODE_MISMATCH');
  if (actual.versionName !== expected.versionName) throw new Error('APK_VERSION_NAME_MISMATCH');
  return true;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`APK_TOOL_FAILED:${command}:${detail}`);
  }
  return result.stdout;
}

export async function verifyApkIdentity({
  apkPath,
  identityPath = new URL('../apk-identity.json', import.meta.url),
  versionPath = new URL('../version.json', import.meta.url),
  apksigner = process.env.APKSIGNER || 'apksigner',
  aapt = process.env.AAPT || 'aapt',
  sourceCommit = process.env.APK_SOURCE_COMMIT || process.env.GITHUB_SHA || null,
  evidencePath = null,
} = {}) {
  if (!apkPath) throw new Error('APK_PATH_REQUIRED');
  const [identity, version, apkBytes] = await Promise.all([
    readFile(identityPath, 'utf8').then(JSON.parse),
    readFile(versionPath, 'utf8').then(JSON.parse),
    readFile(apkPath),
  ]);
  const signerOutput = run(apksigner, ['verify', '--print-certs', apkPath]);
  const badgingOutput = run(aapt, ['dump', 'badging', apkPath]);
  const badging = parseAaptBadging(badgingOutput);
  const actual = { ...badging, signerCertificateSha256: parseApksignerCertificateSha256(signerOutput) };
  const expected = {
    applicationId: identity.applicationId,
    signerCertificateSha256: identity.signerCertificateSha256,
    versionCode: version.versionCode,
    versionName: version.versionName,
  };
  assertApkIdentity(actual, expected);
  const evidence = {
    identitySchemaVersion: identity.identitySchemaVersion,
    sourceCommit,
    apkSha256: createHash('sha256').update(apkBytes).digest('hex'),
    ...actual,
  };
  if (evidencePath) await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const apkPath = process.argv[2];
  const evidencePath = process.argv[3] ?? null;
  const evidence = await verifyApkIdentity({ apkPath, evidencePath });
  console.log(JSON.stringify(evidence));
}
