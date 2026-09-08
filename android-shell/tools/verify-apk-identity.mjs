import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
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

function pathLabel(value) {
  const path = value instanceof URL ? fileURLToPath(value) : String(value ?? '');
  return basename(path);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertProvenanceMetadata(metadata) {
  const missing = [];
  for (const name of ['sourceRepository', 'sourceRef', 'sourceCommit', 'workflowRunId', 'builtAt']) {
    if (!String(metadata?.[name] ?? '').trim()) missing.push(name);
  }
  if (missing.length > 0) {
    const error = new Error('APK_PROVENANCE_METADATA_MISSING');
    error.code = 'APK_PROVENANCE_METADATA_MISSING';
    error.missing = missing;
    throw error;
  }
}

export async function verifyApkIdentity({
  apkPath,
  identityPath = new URL('../apk-identity.json', import.meta.url),
  versionPath = new URL('../version.json', import.meta.url),
  ownershipNoticePath = new URL('../IP-NOTICE.md', import.meta.url),
  apksigner = process.env.APKSIGNER || 'apksigner',
  aapt = process.env.AAPT || 'aapt',
  sourceCommit = process.env.APK_SOURCE_COMMIT || process.env.GITHUB_SHA || null,
  sourceRepository = process.env.APK_SOURCE_REPOSITORY || process.env.GITHUB_REPOSITORY || null,
  sourceRef = process.env.APK_SOURCE_REF || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF || null,
  workflowRunId = process.env.APK_WORKFLOW_RUN_ID || process.env.GITHUB_RUN_ID || null,
  builtAt = process.env.APK_BUILD_TIME || new Date().toISOString(),
  evidencePath = null,
} = {}) {
  if (!apkPath) throw new Error('APK_PATH_REQUIRED');
  assertProvenanceMetadata({ sourceRepository, sourceRef, sourceCommit, workflowRunId, builtAt });

  const [identity, version, apkBytes, noticeBytes] = await Promise.all([
    readFile(identityPath, 'utf8').then(JSON.parse),
    readFile(versionPath, 'utf8').then(JSON.parse),
    readFile(apkPath),
    readFile(ownershipNoticePath),
  ]);

  const signerOutput = run(apksigner, ['verify', '--print-certs', apkPath]);
  const badgingOutput = run(aapt, ['dump', 'badging', apkPath]);
  const badging = parseAaptBadging(badgingOutput);
  const actual = {
    ...badging,
    signerCertificateSha256: parseApksignerCertificateSha256(signerOutput),
  };
  const expected = {
    applicationId: identity.applicationId,
    signerCertificateSha256: identity.signerCertificateSha256,
    versionCode: version.versionCode,
    versionName: version.versionName,
  };
  assertApkIdentity(actual, expected);

  const evidence = {
    provenanceSchemaVersion: 1,
    identitySchemaVersion: identity.identitySchemaVersion,
    sourceRepository,
    sourceRef,
    sourceCommit,
    workflowRunId: String(workflowRunId),
    builtAt,
    apkSha256: sha256(apkBytes),
    ...actual,
    keyAliasLabel: identity.keyAliasLabel ?? null,
    ownershipNoticePath: pathLabel(ownershipNoticePath),
    ownershipNoticeSha256: sha256(noticeBytes),
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
