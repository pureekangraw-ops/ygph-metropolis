const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function load(name) {
  return import(pathToFileURL(path.resolve(__dirname, `../lighthouse-next/update/${name}.mjs`)).href);
}

const payload = Buffer.from('patchmaster-acceptance-v1');
const digest = `sha256:${createHash('sha256').update(payload).digest('hex')}`;

function manifest(overrides = {}) {
  return {
    app_id: 'com.yggdrasil.lighthouse',
    release_id: 'lh-1009',
    version: '1.0.1',
    channel: 'owner-test',
    package_type: 'module',
    min_current_version: '1.0.0',
    allowed_scope: ['lighthouse-next/view-model.mjs'],
    payload_hash: digest,
    signing_identity: 'owner-release',
    source_commit: '0123456789abcdef',
    build_provenance: { workflow: 'owner-build', run_id: 'acceptance-1' },
    dependencies: [],
    rollback_policy: 'previous-known-good',
    created_at: '2026-09-13T05:00:00Z',
    ...overrides,
  };
}

const trustedVerifier = {
  async verifyManifest(value) {
    return { verified: true, signingIdentity: value.signing_identity };
  },
};

async function verify(candidate, bytes = payload, verifier = trustedVerifier) {
  const { verifyRelease } = await load('release-trust');
  return verifyRelease({
    manifest: candidate,
    payloadBytes: bytes,
    expectedAppId: 'com.yggdrasil.lighthouse',
    currentVersion: '1.0.0',
    trustedVerifier: verifier,
  });
}

test('valid trusted release reaches commit only after matching readback', async () => {
  const { runUpdate } = await load('update-pipeline');
  const events = [];
  const result = await runUpdate({
    resolver: {
      async check() { events.push('CHECK'); return { available: true }; },
      async resolve() { events.push('RESOLVE'); return { manifest: manifest() }; },
    },
    downloader: { async download() { events.push('DOWNLOAD'); return payload; } },
    client: {
      async verify(m, bytes) { events.push('VERIFY'); return verify(m, bytes); },
      async stage() { events.push('STAGE'); return { staged: true }; },
      async test() { events.push('TEST'); return { passed: true }; },
      async activate() { events.push('ACTIVATE'); return { activated: true }; },
      async readback(evidence) { events.push('READBACK'); return evidence; },
      async rollback() { events.push('ROLLBACK'); },
    },
    knownGood: {
      async beginCandidate() { events.push('BEGIN_CANDIDATE'); },
      async commitAfterReadback(readback) { events.push('COMMIT'); return { current: readback }; },
      async abortCandidate() { events.push('ABORT'); },
    },
  });
  assert.equal(result.status, 'COMMITTED');
  assert.ok(events.indexOf('READBACK') < events.indexOf('COMMIT'));
  assert.equal(events.includes('ROLLBACK'), false);
});

test('tamper, wrong app, incompatible release, unauthorized scope and failed manifest evidence are rejected', async () => {
  await assert.rejects(() => verify(manifest(), Buffer.from('tampered')), /digest mismatch/);
  await assert.rejects(() => verify(manifest({ app_id: 'other.app' })), /identity/);
  await assert.rejects(() => verify(manifest({ version: '1.0.0' })), /newer/);
  await assert.rejects(() => verify(manifest({ allowed_scope: ['greenfield/runtime.mjs'] })));
  await assert.rejects(() => verify(manifest(), payload, { async verifyManifest() { return { verified: false }; } }), /verification failed/);
});

test('resolver outage does not begin candidate or activation', async () => {
  const { runUpdate } = await load('update-pipeline');
  let candidateStarted = false;
  let activated = false;
  await assert.rejects(() => runUpdate({
    resolver: { async check() { throw new Error('PATCHMASTER_UNAVAILABLE'); }, async resolve() {} },
    downloader: { async download() {} },
    client: {
      async verify() {}, async stage() {}, async test() {},
      async activate() { activated = true; }, async readback() {}, async rollback() {},
    },
    knownGood: {
      async beginCandidate() { candidateStarted = true; },
      async commitAfterReadback() {}, async abortCandidate() {},
    },
  }), /PATCHMASTER_UNAVAILABLE/);
  assert.equal(candidateStarted, false);
  assert.equal(activated, false);
});

test('readback failure rolls back and never commits', async () => {
  const { runUpdate } = await load('update-pipeline');
  let rolledBack = false;
  let committed = false;
  let aborted = false;
  await assert.rejects(() => runUpdate({
    resolver: { async check() { return { available: true }; }, async resolve() { return { manifest: manifest() }; } },
    downloader: { async download() { return payload; } },
    client: {
      async verify(m, bytes) { return verify(m, bytes); },
      async stage() { return {}; }, async test() {}, async activate() {},
      async readback() { throw new Error('READBACK_MISMATCH'); },
      async rollback() { rolledBack = true; },
    },
    knownGood: {
      async beginCandidate() {},
      async commitAfterReadback() { committed = true; },
      async abortCandidate() { aborted = true; },
    },
  }), /READBACK_MISMATCH/);
  assert.equal(rolledBack, true);
  assert.equal(aborted, true);
  assert.equal(committed, false);
});
