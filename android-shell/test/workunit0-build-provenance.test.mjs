import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyApkIdentity } from '../tools/verify-apk-identity.mjs';

const signer = 'aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce';
const ownerWorkflowUrl = new URL('../../.github/workflows/lighthouse-owner-build.yml', import.meta.url);
const noticeUrl = new URL('../IP-NOTICE.md', import.meta.url);

async function writeExecutable(path, text) {
  await writeFile(path, `#!/bin/sh\ncat <<'EOF'\n${text}\nEOF\n`, 'utf8');
  await chmod(path, 0o755);
}

async function createVerifierFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'lighthouse-provenance-'));
  const apkPath = join(dir, 'lighthouse-release.apk');
  const identityPath = join(dir, 'apk-identity.json');
  const versionPath = join(dir, 'version.json');
  const evidencePath = join(dir, 'apk-identity-evidence.json');
  const ownershipNoticePath = join(dir, 'IP-NOTICE.md');
  const apksigner = join(dir, 'apksigner');
  const aapt = join(dir, 'aapt');
  const apkBytes = Buffer.from('signed-apk-byte-fixture');
  const notice = '# LIGHTHOUSE Intellectual Property Notice\nOwner: pureekangraw-ops\n';

  await Promise.all([
    writeFile(apkPath, apkBytes),
    writeFile(identityPath, `${JSON.stringify({
      identitySchemaVersion:1,
      applicationId:'com.yggdrasil.lighthouse',
      signerCertificateSha256:signer,
      keyAliasLabel:'lighthouse-apk-release',
    }, null, 2)}\n`, 'utf8'),
    writeFile(versionPath, `${JSON.stringify({ versionCode:1005, versionName:'1.0.0' }, null, 2)}\n`, 'utf8'),
    writeFile(ownershipNoticePath, notice, 'utf8'),
    writeExecutable(apksigner, `Signer #1 certificate SHA-256 digest: ${signer}`),
    writeExecutable(aapt, "package: name='com.yggdrasil.lighthouse' versionCode='1005' versionName='1.0.0'"),
  ]);

  return {
    dir,
    apkPath,
    identityPath,
    versionPath,
    evidencePath,
    ownershipNoticePath,
    apksigner,
    aapt,
    apkBytes,
    notice,
  };
}

test('signed APK evidence binds final bytes to canonical signer source build and IP notice', async () => {
  const fixture = await createVerifierFixture();
  try {
    const evidence = await verifyApkIdentity({
      ...fixture,
      sourceCommit:'0123456789abcdef0123456789abcdef01234567',
      sourceRepository:'pureekangraw-ops/ygph-metropolis',
      sourceRef:'feat/lighthouse-1.0.0-rebuild',
      workflowRunId:'33870124759',
      builtAt:'2026-09-04T12:00:00.000Z',
    });

    assert.equal(evidence.provenanceSchemaVersion, 1);
    assert.equal(evidence.sourceRepository, 'pureekangraw-ops/ygph-metropolis');
    assert.equal(evidence.sourceRef, 'feat/lighthouse-1.0.0-rebuild');
    assert.equal(evidence.sourceCommit, '0123456789abcdef0123456789abcdef01234567');
    assert.equal(evidence.workflowRunId, '33870124759');
    assert.equal(evidence.builtAt, '2026-09-04T12:00:00.000Z');
    assert.equal(evidence.applicationId, 'com.yggdrasil.lighthouse');
    assert.equal(evidence.signerCertificateSha256, signer);
    assert.equal(evidence.keyAliasLabel, 'lighthouse-apk-release');
    assert.equal(evidence.apkSha256, createHash('sha256').update(fixture.apkBytes).digest('hex'));
    assert.equal(evidence.ownershipNoticePath, 'IP-NOTICE.md');
    assert.equal(evidence.ownershipNoticeSha256, createHash('sha256').update(fixture.notice).digest('hex'));

    const durable = JSON.parse(await readFile(fixture.evidencePath, 'utf8'));
    assert.deepEqual(durable, evidence);
  } finally {
    await rm(fixture.dir, { recursive:true, force:true });
  }
});

test('provenance verification fails closed when source or workflow metadata is incomplete', async () => {
  const fixture = await createVerifierFixture();
  try {
    await assert.rejects(
      () => verifyApkIdentity({
        ...fixture,
        sourceCommit:null,
        sourceRepository:null,
        sourceRef:null,
        workflowRunId:null,
        builtAt:null,
      }),
      error => {
        assert.equal(error?.code, 'APK_PROVENANCE_METADATA_MISSING');
        assert.deepEqual(error?.missing, ['sourceRepository', 'sourceRef', 'sourceCommit', 'workflowRunId', 'builtAt']);
        return true;
      },
    );
  } finally {
    await rm(fixture.dir, { recursive:true, force:true });
  }
});

test('Owner Build passes provenance metadata to final-byte identity verification and uploads the notice', async () => {
  const workflow = await readFile(ownerWorkflowUrl, 'utf8');
  const verifyStart = workflow.indexOf('Verify final APK identity');
  const uploadStart = workflow.indexOf('Upload owner-test APK');
  assert.ok(verifyStart >= 0 && uploadStart > verifyStart, 'owner verification/upload steps must exist in order');
  const verifyBlock = workflow.slice(verifyStart, uploadStart);
  for (const token of [
    'APK_SOURCE_COMMIT',
    'APK_SOURCE_REPOSITORY',
    'APK_SOURCE_REF',
    'APK_WORKFLOW_RUN_ID',
    'APK_BUILD_TIME',
  ]) assert.match(verifyBlock, new RegExp(token));
  const uploadBlock = workflow.slice(uploadStart);
  assert.match(uploadBlock, /apk-identity-evidence\.json/);
  assert.match(uploadBlock, /IP-NOTICE\.md/);
});

test('IP notice identifies LIGHTHOUSE as proprietary owner software and records the canonical signer fingerprint', async () => {
  const notice = await readFile(noticeUrl, 'utf8');
  assert.match(notice, /LIGHTHOUSE/i);
  assert.match(notice, /pureekangraw-ops/i);
  assert.match(notice, /proprietary|all rights reserved/i);
  assert.match(notice, new RegExp(signer, 'i'));
  assert.match(notice, /digital signature|signing certificate|signer/i);
});
