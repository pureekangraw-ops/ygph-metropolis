import test from 'node:test';
import assert from 'node:assert/strict';
import { TRUSTED_PATCH_MANIFEST_URL, fetchLatestPatch } from '../www/patch/patch-runtime.mjs';

function jsonResponse(value, ok = true) { return { ok, async json(){ return value; }, async text(){ return JSON.stringify(value); } }; }
function bytesResponse(bytes, ok = true) { return { ok, async arrayBuffer(){ return Uint8Array.from(bytes).buffer; } }; }
function manifestEntry(baseVersion, overrides = {}) {
  return { baseVersion, patchUrl:'https://example.invalid/p.lhpatch', sha256:'00'.repeat(32), size:100, ...overrides };
}

test('trusted manifest endpoint is fixed in the non-patchable runtime', () => {
  assert.equal(typeof TRUSTED_PATCH_MANIFEST_URL, 'string'); assert.match(TRUSTED_PATCH_MANIFEST_URL, /^https:\/\//);
});

test('no newer patch returns latest/no action and does not download', async () => {
  const calls = [];
  const result = await fetchLatestPatch({ currentVersion:'0.0.5', fetchImpl:async url => { calls.push(url); return jsonResponse({ latestVersion:'0.0.5', patches:{} }); } });
  assert.equal(result.status, 'LATEST'); assert.equal(calls.length, 1);
});

test('manifest without an entry for the current base version fails closed before download', async () => {
  let calls = 0;
  await assert.rejects(fetchLatestPatch({ currentVersion:'0.0.4', fetchImpl:async () => { calls += 1; return jsonResponse({ latestVersion:'0.0.5', patches:{ '0.0.1':manifestEntry('0.0.1') } }); } }), /manifest|baseVersion/i);
  assert.equal(calls, 1);
});

test('download length or sha mismatch fails closed before verifier or staging', async () => {
  let verifierCalls = 0;
  const fetchImpl = async url => url === TRUSTED_PATCH_MANIFEST_URL
    ? jsonResponse({ latestVersion:'0.0.5', patches:{ '0.0.4':manifestEntry('0.0.4') } })
    : bytesResponse([123,125]);
  await assert.rejects(fetchLatestPatch({ currentVersion:'0.0.4', fetchImpl, verifyDownloadedBundle:async () => { verifierCalls += 1; } }), /size|hash/i);
  assert.equal(verifierCalls, 0);
});

test('valid download for current base is passed to the current verifier seam', async () => {
  const body = Buffer.from(JSON.stringify({ schema:'lighthouse.patch.v1', baseVersion:'0.0.4', version:'0.0.5' }), 'utf8');
  const { createHash } = await import('node:crypto'); const sha256 = createHash('sha256').update(body).digest('hex'); let seen;
  const result = await fetchLatestPatch({
    currentVersion:'0.0.4',
    fetchImpl:async url => url === TRUSTED_PATCH_MANIFEST_URL
      ? jsonResponse({ latestVersion:'0.0.5', patches:{ '0.0.4':manifestEntry('0.0.4', { sha256, size:body.length }) } })
      : bytesResponse([...body]),
    verifyDownloadedBundle:async bundle => { seen = bundle; return { ok:true }; },
  });
  assert.equal(seen.version,'0.0.5'); assert.equal(seen.baseVersion,'0.0.4'); assert.equal(result.status,'DOWNLOADED_VERIFIED');
});

test('clean 0.0.1 and patched 0.0.4 devices select different signed assets from the same manifest', async () => {
  const selected = [];
  const mkFetch = current => async url => {
    if (url === TRUSTED_PATCH_MANIFEST_URL) return jsonResponse({ latestVersion:'0.0.5', patches:{
      '0.0.1':manifestEntry('0.0.1', { patchUrl:'https://example.invalid/bootstrap.lhpatch' }),
      '0.0.4':manifestEntry('0.0.4', { patchUrl:'https://example.invalid/incremental.lhpatch' }),
    } });
    selected.push([current,url]);
    return bytesResponse([1]);
  };
  for (const current of ['0.0.1','0.0.4']) {
    await assert.rejects(fetchLatestPatch({ currentVersion:current, fetchImpl:mkFetch(current) }), /size|hash/);
  }
  assert.deepEqual(selected, [['0.0.1','https://example.invalid/bootstrap.lhpatch'],['0.0.4','https://example.invalid/incremental.lhpatch']]);
});
