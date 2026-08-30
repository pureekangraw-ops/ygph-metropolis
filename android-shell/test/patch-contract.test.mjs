import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const encoder = new TextEncoder();

async function loadContract() {
  try {
    return await import('../www/patch/patch-contract.mjs');
  } catch (error) {
    assert.fail(`patch contract module is required: ${error?.code ?? error?.message ?? error}`);
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
