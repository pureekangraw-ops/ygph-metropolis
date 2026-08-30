import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { verifyPatchBundle } from '../www/patch/patch-contract.mjs';

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

function pem(label, bytes) {
  const base64 = Buffer.from(bytes).toString('base64').match(/.{1,64}/gu).join('\n');
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----\n`;
}

async function allFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);
    if (entry.isDirectory()) files.push(...await allFiles(child));
    else files.push(child);
  }
  return files;
}

async function loadSigner() {
  try {
    return await import('../tools/sign-patch.mjs');
  } catch (error) {
    assert.fail(`patch signing tool is required: ${error?.code ?? error?.message ?? error}`);
  }
}

test('pinned debug public key validates the committed benign sample patch', async () => {
  const trustedKey = JSON.parse(await read('www/patch/trusted-key.json'));
  const sample = JSON.parse(await read('test/fixtures/sample-update.lhpatch'));

  assert.equal(trustedKey.keyId, 'lighthouse-debug-patch-1');
  assert.equal(trustedKey.alg, 'ECDSA-P256-SHA256');
  assert.equal(trustedKey.jwk.kty, 'EC');
  assert.equal(trustedKey.jwk.crv, 'P-256');
  assert.equal('d' in trustedKey.jwk, false);

  const verified = await verifyPatchBundle(sample, {
    currentVersion: '0.0.1',
    trustedKey,
  });
  assert.equal(verified.version, '0.0.2');
  assert.deepEqual(Object.keys(verified.files), ['ui.html']);
  assert.match(verified.files['ui.html'].content, /LIGHTHOUSE Patch Proof 0\.0\.2/);
});

test('signPatchSource creates a bundle verifiable by the matching public key', async () => {
  const { signPatchSource } = await loadSigner();
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const privatePkcs8 = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const source = {
    baseVersion: '0.0.1',
    version: '0.0.2',
    files: { 'ui.html': '<main>ephemeral signed patch</main>' },
  };

  const bundle = await signPatchSource({
    source,
    privateKeyPem: pem('PRIVATE KEY', privatePkcs8),
    keyId: 'ephemeral-test-key',
  });

  const verified = await verifyPatchBundle(bundle, {
    currentVersion: '0.0.1',
    trustedKey: {
      keyId: 'ephemeral-test-key',
      alg: 'ECDSA-P256-SHA256',
      jwk: publicJwk,
    },
  });
  assert.equal(verified.files['ui.html'].content, source.files['ui.html']);
});

test('release signing gate proves the private key matches the trusted public key before signing', async () => {
  const { assertPrivateKeyMatchesTrustedKey } = await loadSigner();
  assert.equal(typeof assertPrivateKeyMatchesTrustedKey, 'function');

  const matchingPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const wrongPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  const matchingPrivate = pem('PRIVATE KEY', await webcrypto.subtle.exportKey('pkcs8', matchingPair.privateKey));
  const wrongPrivate = pem('PRIVATE KEY', await webcrypto.subtle.exportKey('pkcs8', wrongPair.privateKey));
  const publicJwk = await webcrypto.subtle.exportKey('jwk', matchingPair.publicKey);
  const trustedKey = {
    keyId: 'release-test-key',
    alg: 'ECDSA-P256-SHA256',
    jwk: publicJwk,
  };

  await assert.doesNotReject(() => assertPrivateKeyMatchesTrustedKey({
    privateKeyPem: matchingPrivate,
    trustedKey,
  }));
  await assert.rejects(
    () => assertPrivateKeyMatchesTrustedKey({ privateKeyPem: wrongPrivate, trustedKey }),
    /does not match trusted public key/i,
  );
});

test('package exposes generic signing plus the exact 0.0.3 release command and contains no private PEM', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts['patch:sign'], 'node tools/sign-patch.mjs');
  assert.equal(
    pkg.scripts['patch:release:0.0.3'],
    'node tools/sign-patch.mjs test/fixtures/front-door-0.0.3-input.json',
  );

  const roots = [new URL('www/', root), new URL('tools/', root)];
  for (const directory of roots) {
    for (const file of await allFiles(directory)) {
      const content = await readFile(file, 'utf8');
      assert.doesNotMatch(content, /-----BEGIN (?:EC )?PRIVATE KEY-----/u, `private key marker in ${file.pathname}`);
    }
  }
});
