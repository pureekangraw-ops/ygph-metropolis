import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRUSTED_PATCH_MANIFEST_URL,
  fetchLatestPatch,
} from '../www/patch/patch-runtime.mjs';

function jsonResponse(value, ok = true) {
  return { ok, async json() { return value; }, async text() { return JSON.stringify(value); }, headers:{ get(){ return null; } } };
}

function bytesResponse(bytes, ok = true) {
  return { ok, async arrayBuffer() { return Uint8Array.from(bytes).buffer; }, headers:{ get(name){ return name.toLowerCase() === 'content-length' ? String(bytes.length) : null; } } };
}

test('trusted manifest endpoint is fixed in the non-patchable runtime', () => {
  assert.equal(typeof TRUSTED_PATCH_MANIFEST_URL, 'string');
  assert.ok(TRUSTED_PATCH_MANIFEST_URL.length > 0);
  assert.match(TRUSTED_PATCH_MANIFEST_URL, /^https:\/\//);
});

test('no newer patch returns latest/no action and does not download', async () => {
  const calls = [];
  const result = await fetchLatestPatch({
    currentVersion:'0.0.5',
    fetchImpl:async (url) => {
      calls.push(url);
      return jsonResponse({ latestVersion:'0.0.5', baseVersion:'0.0.5', patchUrl:'https://example.invalid/p.lhpatch', sha256:'00'.repeat(32) });
    },
  });
  assert.equal(result.status, 'LATEST');
  assert.equal(calls.length, 1);
});

test('invalid manifest fails closed before download', async () => {
  let calls = 0;
  await assert.rejects(fetchLatestPatch({
    currentVersion:'0.0.4',
    fetchImpl:async () => { calls += 1; return jsonResponse({ latestVersion:'0.0.5' }); },
  }), /manifest/i);
  assert.equal(calls, 1);
});

test('download length or sha mismatch fails closed before verifier/staging', async () => {
  let verifierCalls = 0;
  const fetchImpl = async (url) => {
    if (url === TRUSTED_PATCH_MANIFEST_URL) {
      return jsonResponse({
        latestVersion:'0.0.5', baseVersion:'0.0.4', patchUrl:'https://example.invalid/p.lhpatch',
        sha256:'00'.repeat(32), size:100,
      });
    }
    return bytesResponse([123,125]);
  };
  await assert.rejects(fetchLatestPatch({
    currentVersion:'0.0.4', fetchImpl,
    verifyDownloadedBundle:async () => { verifierCalls += 1; },
  }), /size|hash/i);
  assert.equal(verifierCalls, 0);
});

test('valid download is passed as parsed bundle to the current verifier seam', async () => {
  const body = Buffer.from(JSON.stringify({ schema:'lighthouse.patch.v1', version:'0.0.5' }), 'utf8');
  const { createHash } = await import('node:crypto');
  const sha256 = createHash('sha256').update(body).digest('hex');
  let seen;
  const result = await fetchLatestPatch({
    currentVersion:'0.0.4',
    fetchImpl:async (url) => url === TRUSTED_PATCH_MANIFEST_URL
      ? jsonResponse({ latestVersion:'0.0.5', baseVersion:'0.0.4', patchUrl:'https://example.invalid/p.lhpatch', sha256, size:body.length })
      : bytesResponse([...body]),
    verifyDownloadedBundle:async (bundle) => { seen = bundle; return { ok:true }; },
  });
  assert.equal(seen.version, '0.0.5');
  assert.equal(result.status, 'DOWNLOADED_VERIFIED');
});
