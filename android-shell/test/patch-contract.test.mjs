import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

const { subtle } = webcrypto;
const encoder = new TextEncoder();

async function loadContract() {
  try {
    return await import('../www/patch/patch-contract.mjs');
  } catch (error) {
    assert.fail(`patch contract module is required: ${error?.code ?? error?.message ?? error}`);
  }
}

async function loadStore() {
  try {
    return await import('../www/patch/patch-store.mjs');
  } catch (error) {
    assert.fail(`patch store module is required: ${error?.code ?? error?.message ?? error}`);
  }
}

function base64url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

async function sha256Hex(text) {
  const digest = await subtle.digest('SHA-256', encoder.encode(text));
  return Buffer.from(digest).toString('hex');
}

function canonicalForTest(bundle) {
  const files = Object.keys(bundle.files)
    .sort()
    .map((path) => ({ path, sha256: bundle.files[path].sha256 }));

  return JSON.stringify({
    schema: bundle.schema,
    baseVersion: bundle.baseVersion,
    version: bundle.version,
    files,
  });
}

async function keyPair(keyId = 'test-key-1') {
  const pair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  return {
    pair,
    trustedKey: {
      keyId,
      alg: 'ECDSA-P256-SHA256',
      jwk: await subtle.exportKey('jwk', pair.publicKey),
    },
  };
}

async function signedBundle({
  privateKey,
  keyId = 'test-key-1',
  baseVersion = '0.0.1',
  version = '0.0.2',
  files = { 'ui.html': '<main>patched</main>' },
}) {
  const entries = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = { sha256: await sha256Hex(content), content };
  }

  const bundle = {
    schema: 'lighthouse.patch.v1',
    baseVersion,
    version,
    files: entries,
    signature: {
      alg: 'ECDSA-P256-SHA256',
      keyId,
      value: '',
    },
  };

  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(canonicalForTest(bundle)),
  );
  bundle.signature.value = base64url(signature);
  return bundle;
}

function baseSnapshot() {
  return {
    version: '0.0.1',
    assets: {
      'ui.html': '<main>base</main>',
      'ui.css': 'main { display: block; }',
      'logic.mjs': 'export async function mount() {}',
      'rules.json': '{"mode":"base"}',
      'vocabulary.json': '{"hello":"สวัสดี"}',
    },
  };
}

test('accepts a valid signed patch for the current version', async () => {
  const { verifyPatchBundle } = await loadContract();
  const { pair, trustedKey } = await keyPair();
  const bundle = await signedBundle({ privateKey: pair.privateKey });

  const verified = await verifyPatchBundle(bundle, {
    currentVersion: '0.0.1',
    trustedKey,
  });

  assert.equal(verified.schema, 'lighthouse.patch.v1');
  assert.equal(verified.baseVersion, '0.0.1');
  assert.equal(verified.version, '0.0.2');
  assert.equal(verified.files['ui.html'].content, '<main>patched</main>');
});

test('rejects a patch whose baseVersion is not the current version', async () => {
  const { verifyPatchBundle } = await loadContract();
  const { pair, trustedKey } = await keyPair();
  const bundle = await signedBundle({
    privateKey: pair.privateKey,
    baseVersion: '0.0.0',
    version: '0.0.2',
  });

  await assert.rejects(
    verifyPatchBundle(bundle, { currentVersion: '0.0.1', trustedKey }),
    /baseVersion.*current/i,
  );
});

test('rejects a non-increasing target version', async () => {
  const { verifyPatchBundle } = await loadContract();
  const { pair, trustedKey } = await keyPair();
  const bundle = await signedBundle({
    privateKey: pair.privateKey,
    baseVersion: '0.0.1',
    version: '0.0.1',
  });

  await assert.rejects(
    verifyPatchBundle(bundle, { currentVersion: '0.0.1', trustedKey }),
    /version.*greater/i,
  );
});

test('rejects content whose SHA-256 no longer matches the signed digest', async () => {
  const { verifyPatchBundle } = await loadContract();
  const { pair, trustedKey } = await keyPair();
  const bundle = await signedBundle({ privateKey: pair.privateKey });
  bundle.files['ui.html'].content = '<main>tampered</main>';

  await assert.rejects(
    verifyPatchBundle(bundle, { currentVersion: '0.0.1', trustedKey }),
    /sha-?256|hash/i,
  );
});

test('rejects a signature made by an untrusted private key', async () => {
  const { verifyPatchBundle } = await loadContract();
  const trusted = await keyPair('test-key-1');
  const attacker = await keyPair('test-key-1');
  const bundle = await signedBundle({
    privateKey: attacker.pair.privateKey,
    keyId: 'test-key-1',
  });

  await assert.rejects(
    verifyPatchBundle(bundle, {
      currentVersion: '0.0.1',
      trustedKey: trusted.trustedKey,
    }),
    /signature/i,
  );
});

test('rejects unsupported or traversal asset paths', async () => {
  const { verifyPatchBundle } = await loadContract();
  const { pair, trustedKey } = await keyPair();
  const bundle = await signedBundle({
    privateKey: pair.privateKey,
    files: { '../evil.mjs': 'export default 1' },
  });

  await assert.rejects(
    verifyPatchBundle(bundle, { currentVersion: '0.0.1', trustedKey }),
    /unsupported.*path|asset path/i,
  );
});

test('rejects patches larger than the 2 MiB content limit', async () => {
  const { verifyPatchBundle, PATCH_MAX_BYTES } = await loadContract();
  assert.equal(PATCH_MAX_BYTES, 2 * 1024 * 1024);
  const { pair, trustedKey } = await keyPair();
  const bundle = await signedBundle({
    privateKey: pair.privateKey,
    files: { 'logic.mjs': 'x'.repeat(PATCH_MAX_BYTES + 1) },
  });

  await assert.rejects(
    verifyPatchBundle(bundle, { currentVersion: '0.0.1', trustedKey }),
    /too large|size/i,
  );
});

test('changed-file-only patch composes a complete snapshot', async () => {
  const { composeSnapshot } = await loadStore();
  const base = baseSnapshot();
  const snapshot = composeSnapshot({
    currentSnapshot: base,
    baseAssets: base.assets,
    verifiedPatch: {
      version: '0.0.2',
      files: {
        'ui.html': { sha256: '0'.repeat(64), content: '<main>patched</main>' },
      },
    },
  });

  assert.equal(snapshot.version, '0.0.2');
  assert.equal(snapshot.assets['ui.html'], '<main>patched</main>');
  assert.equal(snapshot.assets['ui.css'], base.assets['ui.css']);
  assert.equal(snapshot.assets['logic.mjs'], base.assets['logic.mjs']);
  assert.equal(snapshot.assets['rules.json'], base.assets['rules.json']);
  assert.equal(snapshot.assets['vocabulary.json'], base.assets['vocabulary.json']);
});

test('staging is readable before activation and does not move current', async () => {
  const { createMemoryPatchStore } = await loadStore();
  const base = baseSnapshot();
  const store = createMemoryPatchStore({ baseSnapshot: base });
  const candidate = {
    version: '0.0.2',
    assets: { ...base.assets, 'ui.html': '<main>patched</main>' },
  };

  await store.stage(candidate);

  assert.deepEqual(await store.readSnapshot('0.0.2'), candidate);
  assert.deepEqual(await store.readMeta(), {
    currentVersion: '0.0.1',
    previousVersion: null,
  });
});

test('activation moves current and previous pointers together', async () => {
  const { createMemoryPatchStore } = await loadStore();
  const base = baseSnapshot();
  const store = createMemoryPatchStore({ baseSnapshot: base });
  const candidate = {
    version: '0.0.2',
    assets: { ...base.assets, 'ui.html': '<main>patched</main>' },
  };

  await store.stage(candidate);
  await store.activate('0.0.2', '0.0.1');

  assert.deepEqual(await store.readMeta(), {
    currentVersion: '0.0.2',
    previousVersion: '0.0.1',
  });
  assert.deepEqual(await store.readCurrent(), candidate);
});

test('failed staging leaves the active snapshot untouched', async () => {
  const { createMemoryPatchStore } = await loadStore();
  const base = baseSnapshot();
  const store = createMemoryPatchStore({ baseSnapshot: base });

  await assert.rejects(
    store.stage({ version: '0.0.2', assets: { 'ui.html': '<main>partial</main>' } }),
    /complete snapshot|missing asset/i,
  );

  assert.deepEqual(await store.readMeta(), {
    currentVersion: '0.0.1',
    previousVersion: null,
  });
  assert.deepEqual(await store.readCurrent(), base);
});

test('rollback atomically swaps back to the previous complete snapshot', async () => {
  const { createMemoryPatchStore } = await loadStore();
  const base = baseSnapshot();
  const store = createMemoryPatchStore({ baseSnapshot: base });
  const candidate = {
    version: '0.0.2',
    assets: { ...base.assets, 'ui.html': '<main>patched</main>' },
  };

  await store.stage(candidate);
  await store.activate('0.0.2', '0.0.1');
  await store.rollback();

  assert.deepEqual(await store.readMeta(), {
    currentVersion: '0.0.1',
    previousVersion: '0.0.2',
  });
  assert.deepEqual(await store.readCurrent(), base);
});

test('IndexedDB store persists the active pointer and supports rollback after reopen', async () => {
  const { createIndexedDbPatchStore } = await loadStore();
  assert.equal(typeof createIndexedDbPatchStore, 'function');

  const base = baseSnapshot();
  const candidate = {
    version: '0.0.2',
    assets: { ...base.assets, 'ui.html': '<main>persistent patch</main>' },
  };
  const databaseName = `lighthouse-patches-test-${Date.now()}-${Math.random()}`;

  const first = createIndexedDbPatchStore({
    indexedDB: fakeIndexedDB,
    baseSnapshot: base,
    databaseName,
  });
  await first.stage(candidate);
  await first.activate('0.0.2', '0.0.1');
  assert.deepEqual(await first.readCurrent(), candidate);

  const reopened = createIndexedDbPatchStore({
    indexedDB: fakeIndexedDB,
    baseSnapshot: base,
    databaseName,
  });
  assert.deepEqual(await reopened.readMeta(), {
    currentVersion: '0.0.2',
    previousVersion: '0.0.1',
  });
  assert.deepEqual(await reopened.readCurrent(), candidate);

  await reopened.rollback();
  assert.deepEqual(await reopened.readMeta(), {
    currentVersion: '0.0.1',
    previousVersion: '0.0.2',
  });
  assert.deepEqual(await reopened.readCurrent(), base);
});

test('activation with stale expected version is rejected and leaves newer patch Current', async () => {
  const { createMemoryPatchStore } = await loadStore();
  const base = baseSnapshot();
  const store = createMemoryPatchStore({ baseSnapshot: base });

  // Stage and activate 0.0.2 first
  const v2 = {
    version: '0.0.2',
    assets: { ...base.assets, 'ui.html': '<main>v2</main>' },
  };
  await store.stage(v2);
  await store.activate('0.0.2', '0.0.1');
  assert.equal((await store.readMeta()).currentVersion, '0.0.2');

  // Now try to activate a stale 0.0.2 as if it was based on 0.0.1
  const staleV2 = {
    version: '0.0.2',
    assets: { ...base.assets, 'ui.html': '<main>stale v2</main>' },
  };
  await store.stage(staleV2);

  // This should fail because current has moved to 0.0.2, not 0.0.1
  await assert.rejects(
    store.activate('0.0.2', '0.0.1'),
    /Cannot activate.*current version changed/i,
  );

  // Verify current is still 0.0.2 (the newer patch won)
  assert.equal((await store.readMeta()).currentVersion, '0.0.2');
  const current = await store.readCurrent();
  assert.equal(current.assets['ui.html'], '<main>v2</main>');
});
