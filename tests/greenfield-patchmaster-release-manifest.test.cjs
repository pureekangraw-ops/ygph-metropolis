const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadModule() {
  const target = path.resolve(__dirname, '../lighthouse-next/update/release-manifest.mjs');
  return import(pathToFileURL(target).href);
}

function sample() {
  return {
    app_id: 'com.yggdrasil.lighthouse',
    release_id: 'lh-1009',
    version: '1.0.1',
    channel: 'owner-test',
    package_type: 'full',
    min_current_version: '1.0.0',
    allowed_scope: ['full-app'],
    payload_hash: 'sha256:abc123',
    signing_identity: 'owner-release',
    source_commit: '0123456789abcdef',
    build_provenance: { workflow: 'owner-build', run_id: '1' },
    dependencies: [],
    rollback_policy: 'previous-known-good',
    created_at: '2026-09-13T04:00:00Z',
  };
}

test('manifest parser freezes normalized output', async () => {
  const { parseReleaseManifest } = await loadModule();
  const parsed = parseReleaseManifest(sample());
  assert.equal(parsed.app_id, 'com.yggdrasil.lighthouse');
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.allowed_scope));
});

test('manifest parser rejects missing fields', async () => {
  const { parseReleaseManifest, REQUIRED_MANIFEST_FIELDS } = await loadModule();
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    const candidate = sample();
    delete candidate[field];
    assert.throws(() => parseReleaseManifest(candidate));
  }
});

test('manifest parser rejects bad package type and scope', async () => {
  const { parseReleaseManifest } = await loadModule();
  assert.throws(() => parseReleaseManifest({ ...sample(), package_type: 'other' }));
  assert.throws(() => parseReleaseManifest({ ...sample(), allowed_scope: [] }));
});
