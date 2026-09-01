import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffectiveSnapshot } from '../www/patch/effective-snapshot.mjs';
import { createMemoryPatchStore } from '../www/patch/patch-store.mjs';

const patchAssets = (suffix = '') => ({
  'ui.html': `<main>${suffix}</main>`,
  'ui.css': `body{--rev:${JSON.stringify(suffix)}}`,
  'logic.mjs': `export const rev=${JSON.stringify(suffix)};`,
  'rules.json': JSON.stringify({ rev: suffix }),
  'vocabulary.json': JSON.stringify({ rev: suffix }),
});

async function makeEffective({ version, content, patchId = null, previousSnapshotId = null }) {
  return createEffectiveSnapshot({
    version,
    base: { apkVersion: '1.0.3', sourceCommit: '84a6f132880d46475b563f75d6c224184e5e56ff' },
    files: {
      'index.html': { content: '<title>LIGHTHOUSE</title>', source: 'APK_BASE' },
      'ui/app.mjs': patchId
        ? { content, source: 'PATCH', patchId }
        : { content, source: 'APK_BASE' },
    },
    patchChain: patchId ? [patchId] : [],
    previousSnapshotId,
    activatedAt: '2026-09-02T05:30:00+07:00',
  });
}

test('activation moves Current/Previous by immutable effective snapshot id', async () => {
  const baseEffective = await makeEffective({ version: '0.0.6', content: 'base' });
  const store = createMemoryPatchStore({
    baseSnapshot: { version: '0.0.6', assets: patchAssets('base'), effectiveSnapshot: baseEffective },
  });

  const nextEffective = await makeEffective({
    version: '0.0.6-p1',
    content: 'patched',
    patchId: 'PATCH-A',
    previousSnapshotId: baseEffective.snapshotId,
  });
  await store.stage({ version: '0.0.7', assets: patchAssets('patched'), effectiveSnapshot: nextEffective });
  await store.activate('0.0.7', { expectedCurrentVersion: '0.0.6' });

  const meta = await store.readMeta();
  assert.equal(meta.currentSnapshotId, nextEffective.snapshotId);
  assert.equal(meta.previousSnapshotId, baseEffective.snapshotId);
  assert.equal((await store.readCurrent()).effectiveSnapshot.snapshotId, nextEffective.snapshotId);

  await store.rollback();
  const rolledBack = await store.readMeta();
  assert.equal(rolledBack.currentSnapshotId, baseEffective.snapshotId);
  assert.equal(rolledBack.previousSnapshotId, nextEffective.snapshotId);
});

test('store fails closed when staged effective snapshot content was tampered after hashing', async () => {
  const baseEffective = await makeEffective({ version: '0.0.6', content: 'base' });
  const store = createMemoryPatchStore({
    baseSnapshot: { version: '0.0.6', assets: patchAssets('base'), effectiveSnapshot: baseEffective },
  });
  const nextEffective = structuredClone(await makeEffective({
    version: '0.0.6-p1',
    content: 'patched',
    patchId: 'PATCH-A',
    previousSnapshotId: baseEffective.snapshotId,
  }));
  nextEffective.files['ui/app.mjs'].content = 'tampered';

  await assert.rejects(
    () => store.stage({ version: '0.0.7', assets: patchAssets('patched'), effectiveSnapshot: nextEffective }),
    /SNAPSHOT_FILE_HASH_MISMATCH/,
  );
});
