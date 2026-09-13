const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../lighthouse-next/update/release-trust.mjs')).href);
}

const payload = Buffer.from('fixture-v1');
const payloadHash = `sha256:${createHash('sha256').update(payload).digest('hex')}`;

function sample(overrides = {}) {
  return {
    app_id: 'com.yggdrasil.lighthouse', release_id: 'lh-1009', version: '1.0.1', channel: 'owner-test',
    package_type: 'module', min_current_version: '1.0.0', allowed_scope: ['lighthouse-next/view-model.mjs'],
    payload_hash: payloadHash, signing_identity: 'owner-release', source_commit: '0123456789abcdef',
    build_provenance: { workflow: 'owner-build', run_id: '1' }, dependencies: [], rollback_policy: 'previous-known-good',
    created_at: '2026-09-13T04:00:00Z', ...overrides,
  };
}

const verifier = { async verifyManifest(m) { return { verified: true, signingIdentity: m.signing_identity }; } };

test('valid candidate returns frozen evidence', async () => {
  const { verifyRelease } = await loadModule();
  const result = await verifyRelease({ manifest: sample(), payloadBytes: payload, expectedAppId: 'com.yggdrasil.lighthouse', currentVersion: '1.0.0', trustedVerifier: verifier });
  assert.equal(result.verified, true);
  assert.ok(Object.isFrozen(result));
});

test('changed bytes, wrong app and non-newer version are rejected', async () => {
  const { verifyRelease } = await loadModule();
  await assert.rejects(() => verifyRelease({ manifest: sample(), payloadBytes: Buffer.from('changed'), expectedAppId: 'com.yggdrasil.lighthouse', currentVersion: '1.0.0', trustedVerifier: verifier }));
  await assert.rejects(() => verifyRelease({ manifest: sample(), payloadBytes: payload, expectedAppId: 'other.app', currentVersion: '1.0.0', trustedVerifier: verifier }));
  await assert.rejects(() => verifyRelease({ manifest: sample({ version: '1.0.0' }), payloadBytes: payload, expectedAppId: 'com.yggdrasil.lighthouse', currentVersion: '1.0.0', trustedVerifier: verifier }));
});

test('disallowed scope and failed verifier are rejected', async () => {
  const { verifyRelease } = await loadModule();
  await assert.rejects(() => verifyRelease({ manifest: sample({ allowed_scope: ['greenfield/runtime.mjs'] }), payloadBytes: payload, expectedAppId: 'com.yggdrasil.lighthouse', currentVersion: '1.0.0', trustedVerifier: verifier }));
  await assert.rejects(() => verifyRelease({ manifest: sample(), payloadBytes: payload, expectedAppId: 'com.yggdrasil.lighthouse', currentVersion: '1.0.0', trustedVerifier: { async verifyManifest(){ return { verified:false }; } } }));
});
