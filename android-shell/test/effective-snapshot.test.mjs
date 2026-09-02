import test from 'node:test';
import assert from 'node:assert/strict';

async function loadSnapshotModule() {
  try {
    return await import('../www/patch/effective-snapshot.mjs');
  } catch (error) {
    assert.fail(`effective snapshot module is required: ${error?.code ?? error?.message ?? error}`);
  }
}

test('effective snapshot records complete provenance hashes chain and VERIFIED status', async () => {
  const { createEffectiveSnapshot, verifyEffectiveSnapshot } = await loadSnapshotModule();
  const snapshot = await createEffectiveSnapshot({
    version: '0.0.6-p1',
    base: { apkVersion: '1.0.3', sourceCommit: '84a6f132880d46475b563f75d6c224184e5e56ff' },
    files: {
      'index.html': { content: '<title>LIGHTHOUSE</title>', source: 'APK_BASE' },
      'ui/app.mjs': { content: 'export const app = true;', source: 'PATCH', patchId: 'patch-a' },
    },
    patchChain: ['patch-a'],
    previousSnapshotId: 'SNAP-000',
    activatedAt: '2026-09-02T05:30:00+07:00',
  });

  assert.match(snapshot.snapshotId, /^SNAP-[A-F0-9]{16}$/);
  assert.equal(snapshot.status, 'VERIFIED');
  assert.equal(snapshot.previousSnapshotId, 'SNAP-000');
  assert.deepEqual(snapshot.patchChain, ['patch-a']);
  assert.equal(snapshot.base.sourceCommit, '84a6f132880d46475b563f75d6c224184e5e56ff');
  assert.equal(snapshot.files['index.html'].source, 'APK_BASE');
  assert.equal(snapshot.files['ui/app.mjs'].source, 'PATCH');
  assert.match(snapshot.files['index.html'].sha256, /^[a-f0-9]{64}$/);
  assert.match(snapshot.aggregateSha256, /^[a-f0-9]{64}$/);
  await assert.doesNotReject(() => verifyEffectiveSnapshot(snapshot));
});

test('effective snapshot verification fails closed after any file mutation', async () => {
  const { createEffectiveSnapshot, verifyEffectiveSnapshot } = await loadSnapshotModule();
  const snapshot = await createEffectiveSnapshot({
    version: '0.0.6-p1',
    base: { apkVersion: '1.0.3', sourceCommit: '84a6f132880d46475b563f75d6c224184e5e56ff' },
    files: { 'index.html': { content: 'original', source: 'APK_BASE' } },
    patchChain: ['patch-a'],
    previousSnapshotId: null,
    activatedAt: '2026-09-02T05:30:00+07:00',
  });
  const tampered = structuredClone(snapshot);
  tampered.files['index.html'].content = 'tampered';
  await assert.rejects(() => verifyEffectiveSnapshot(tampered), /SNAPSHOT_FILE_HASH_MISMATCH/);
});

test('snapshot objects are immutable in memory', async () => {
  const { createEffectiveSnapshot } = await loadSnapshotModule();
  const snapshot = await createEffectiveSnapshot({
    version: '0.0.6-p1',
    base: { apkVersion: '1.0.3', sourceCommit: '84a6f132880d46475b563f75d6c224184e5e56ff' },
    files: { 'index.html': { content: 'base', source: 'APK_BASE' } },
    patchChain: [],
    previousSnapshotId: null,
    activatedAt: '2026-09-02T05:30:00+07:00',
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.files), true);
  assert.equal(Object.isFrozen(snapshot.files['index.html']), true);
});
