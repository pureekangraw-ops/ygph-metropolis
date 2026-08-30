import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shellRoot = new URL('../', import.meta.url);
const repoRoot = new URL('../../', import.meta.url);
const readShell = (relative) => readFile(new URL(relative, shellRoot), 'utf8');
const readRepo = (relative) => readFile(new URL(relative, repoRoot), 'utf8');

async function loadSyncTool() {
  try {
    return await import('../tools/sync-trusted-brain.mjs');
  } catch (error) {
    assert.fail(`trusted brain sync tool is required: ${error?.code ?? error?.message ?? error}`);
  }
}

test('trusted brain packaging copies audited root Brain/Greenfield sources exactly into non-patchable generated source', async (t) => {
  const { syncTrustedBrainSources } = await loadSyncTool();
  const destination = await mkdtemp(join(tmpdir(), 'lighthouse-trusted-source-'));
  t.after(() => rm(destination, { recursive:true, force:true }));

  const result = await syncTrustedBrainSources({
    repoRoot:new URL('../../', import.meta.url),
    destination,
  });

  assert.deepEqual(result.directories.sort(), ['greenfield', 'lighthouse']);
  assert.equal(
    await readFile(join(destination, 'lighthouse', 'master-input-route.mjs'), 'utf8'),
    await readRepo('lighthouse/master-input-route.mjs'),
  );
  assert.equal(
    await readFile(join(destination, 'lighthouse', 'path-kernel.mjs'), 'utf8'),
    await readRepo('lighthouse/path-kernel.mjs'),
  );
  assert.equal(
    await readFile(join(destination, 'greenfield', 'runtime.mjs'), 'utf8'),
    await readRepo('greenfield/runtime.mjs'),
  );
  assert.equal(
    await readFile(join(destination, 'greenfield', 'browser-store.mjs'), 'utf8'),
    await readRepo('greenfield/browser-store.mjs'),
  );
});

test('npm test prepares trusted source and generated source is excluded from Git history', async () => {
  const pkg = JSON.parse(await readShell('package.json'));
  const gitignore = await readRepo('.gitignore');

  assert.equal(pkg.scripts.pretest, 'node tools/sync-trusted-brain.mjs');
  assert.match(gitignore, /android-shell\/www\/trusted\/source\//);
});
