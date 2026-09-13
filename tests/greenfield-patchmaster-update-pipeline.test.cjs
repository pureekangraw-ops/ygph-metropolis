const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function load() {
  return import(pathToFileURL(path.resolve(__dirname, '../lighthouse-next/update/update-pipeline.mjs')).href);
}

function fixture(failAt = null) {
  const calls = [];
  const hit = async (name, value) => {
    calls.push(name);
    if (failAt === name) throw new Error(`${name} failed`);
    return value;
  };
  const evidence = { releaseId: 'r2', version: '1.0.1', payloadHash: 'h2' };
  return {
    calls,
    resolver: {
      check: () => hit('CHECK', { available: true }),
      resolve: () => hit('RESOLVE', { manifest: { release_id: 'r2' } }),
    },
    downloader: { download: () => hit('DOWNLOAD', Buffer.from('payload')) },
    client: {
      verify: () => hit('VERIFY', evidence),
      stage: () => hit('STAGE', { id: 'staged' }),
      test: () => hit('TEST', { passed: true }),
      activate: () => hit('ACTIVATE', { activated: true }),
      readback: () => hit('READBACK', evidence),
      rollback: () => hit('ROLLBACK', { rolledBack: true }),
    },
    knownGood: {
      beginCandidate: () => hit('BEGIN_CANDIDATE', null),
      commitAfterReadback: () => hit('COMMIT', { current: evidence }),
      abortCandidate: () => hit('ABORT', null),
    },
  };
}

test('pipeline commits only after readback', async () => {
  const { runUpdate } = await load();
  const f = fixture();
  const result = await runUpdate(f);
  assert.equal(result.status, 'COMMITTED');
  assert.deepEqual(f.calls, ['CHECK','RESOLVE','DOWNLOAD','VERIFY','BEGIN_CANDIDATE','STAGE','TEST','ACTIVATE','READBACK','COMMIT']);
});

test('no update exits before download', async () => {
  const { runUpdate } = await load();
  const f = fixture();
  f.resolver.check = async () => { f.calls.push('CHECK'); return { available: false }; };
  const result = await runUpdate(f);
  assert.equal(result.status, 'NO_UPDATE');
  assert.deepEqual(f.calls, ['CHECK']);
});

for (const failAt of ['DOWNLOAD','VERIFY','STAGE','TEST','ACTIVATE','READBACK']) {
  test(`failure at ${failAt} never commits`, async () => {
    const { runUpdate } = await load();
    const f = fixture(failAt);
    await assert.rejects(() => runUpdate(f));
    assert.equal(f.calls.includes('COMMIT'), false);
    if (['STAGE','TEST','ACTIVATE','READBACK'].includes(failAt)) assert.equal(f.calls.includes('ABORT'), true);
  });
}
