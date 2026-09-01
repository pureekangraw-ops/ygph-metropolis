import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

async function loadOverlay() {
  try {
    return await import('../www/patch/canonical-overlay.mjs');
  } catch (error) {
    assert.fail(`canonical overlay module is required: ${error?.code ?? error?.message ?? error}`);
  }
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Buffer.from(digest).toString('hex');
}

async function manifestFor(files) {
  const entries = {};
  for (const [path, value] of Object.entries(files)) {
    entries[path] = {
      sha256: await sha256Hex(value.content),
      patchable: value.patchable,
      source: 'APK_BASE',
    };
  }
  return {
    schema: 'lighthouse.effective-base.v1',
    apkVersion: '1.0.3',
    sourceCommit: '84a6f132880d46475b563f75d6c224184e5e56ff',
    files: entries,
    aggregateSha256: 'a'.repeat(64),
  };
}

function response(text) {
  return { ok:true, async text(){ return text; } };
}

test('canonical base snapshot verifies every manifest file and records full effective app state', async () => {
  const bodies = {
    'index.html': { content:'<title>LIGHTHOUSE</title>', patchable:true },
    'ui/app.mjs': { content:'export const ui=true;', patchable:true },
    'greenfield/runtime.mjs': { content:'export const runtime=true;', patchable:false },
    'sw.js': { content:'self.addEventListener("fetch",()=>{});', patchable:false },
  };
  const manifest = await manifestFor(bodies);
  const requested = [];
  const { createBaseEffectiveSnapshotFromManifest } = await loadOverlay();
  const snapshot = await createBaseEffectiveSnapshotFromManifest({
    manifest,
    fetchImpl: async path => {
      requested.push(path);
      const body = bodies[path];
      return body ? response(body.content) : { ok:false };
    },
    activatedAt:'2026-09-02T06:00:00+07:00',
  });

  assert.equal(snapshot.status, 'VERIFIED');
  assert.equal(snapshot.base.apkVersion, '1.0.3');
  assert.equal(snapshot.base.sourceCommit, manifest.sourceCommit);
  assert.deepEqual(Object.keys(snapshot.files).sort(), Object.keys(bodies).sort());
  assert.equal(snapshot.files['greenfield/runtime.mjs'].source, 'APK_BASE');
  assert.equal(snapshot.files['sw.js'].source, 'APK_BASE');
  assert.deepEqual(requested.sort(), Object.keys(bodies).sort());
});

test('canonical base snapshot fails closed when packaged file differs from manifest hash', async () => {
  const bodies = { 'ui/app.mjs': { content:'expected', patchable:true } };
  const manifest = await manifestFor(bodies);
  const { createBaseEffectiveSnapshotFromManifest } = await loadOverlay();
  await assert.rejects(
    () => createBaseEffectiveSnapshotFromManifest({
      manifest,
      fetchImpl: async () => response('tampered'),
      activatedAt:'2026-09-02T06:00:00+07:00',
    }),
    /BASE_FILE_HASH_MISMATCH:ui\/app\.mjs/,
  );
});

test('canonical patch composition changes only manifest-patchable files and appends provenance', async () => {
  const bodies = {
    'ui/app.mjs': { content:'base-ui', patchable:true },
    'lighthouse/intent-vocabulary.mjs': { content:'base-vocab', patchable:true },
    'greenfield/runtime.mjs': { content:'base-runtime', patchable:false },
  };
  const manifest = await manifestFor(bodies);
  const { createBaseEffectiveSnapshotFromManifest, composeCanonicalEffectiveSnapshot } = await loadOverlay();
  const base = await createBaseEffectiveSnapshotFromManifest({
    manifest,
    fetchImpl: async path => response(bodies[path].content),
    activatedAt:'2026-09-02T06:00:00+07:00',
  });

  const next = await composeCanonicalEffectiveSnapshot({
    currentSnapshot:base,
    manifest,
    patch:{
      patchId:'PATCH-A',
      version:'1.0.3-p1',
      files:{
        'ui/app.mjs':{ content:'patched-ui' },
        'lighthouse/intent-vocabulary.mjs':{ content:'patched-vocab' },
      },
    },
    activatedAt:'2026-09-02T06:05:00+07:00',
  });
  assert.equal(next.previousSnapshotId, base.snapshotId);
  assert.deepEqual(next.patchChain, ['PATCH-A']);
  assert.equal(next.files['ui/app.mjs'].source, 'PATCH');
  assert.equal(next.files['ui/app.mjs'].patchId, 'PATCH-A');
  assert.equal(next.files['greenfield/runtime.mjs'].content, 'base-runtime');
  assert.equal(next.files['greenfield/runtime.mjs'].source, 'APK_BASE');

  await assert.rejects(
    () => composeCanonicalEffectiveSnapshot({
      currentSnapshot:base,
      manifest,
      patch:{ patchId:'PATCH-B', version:'1.0.3-p2', files:{ 'greenfield/runtime.mjs':{ content:'evil' } } },
      activatedAt:'2026-09-02T06:10:00+07:00',
    }),
    /PATCH_PATH_NOT_ALLOWED:greenfield\/runtime\.mjs/,
  );
});
