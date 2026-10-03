import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stagePrismNative, PRISM_RUNTIME_FILES, PRISM_ASSETS } from '../../scripts/stage-prism-native.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
test('staged provenance uses the pinned PRISM head instead of the PR merge SHA', async () => {
  const destinationRoot = await mkdtemp(join(tmpdir(), 'prism-provenance-'));
  const oldHead = process.env.PRISM_SOURCE_COMMIT;
  const oldGithub = process.env.GITHUB_SHA;
  try {
    process.env.PRISM_SOURCE_COMMIT = 'a'.repeat(40);
    process.env.GITHUB_SHA = 'b'.repeat(40);
    const manifest = await stagePrismNative({ repoRoot, destinationRoot });
    assert.equal(manifest.sourceCommit, 'a'.repeat(40));
    const staged = JSON.parse(await readFile(join(destinationRoot, 'release-manifest.json'), 'utf8'));
    assert.equal(staged.sourceCommit, manifest.sourceCommit);
  } finally {
    if (oldHead === undefined) delete process.env.PRISM_SOURCE_COMMIT; else process.env.PRISM_SOURCE_COMMIT = oldHead;
    if (oldGithub === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = oldGithub;
    await rm(destinationRoot, { recursive: true, force: true });
  }
});

test('complete PRISM package preserves runtime and asset bytes with explicit Hub and engine import relocation and excludes legacy parents', async () => {
  const destinationRoot = await mkdtemp(join(tmpdir(), 'prism-package-'));
  try {
    const manifest = await stagePrismNative({ repoRoot, destinationRoot });
    assert.equal(manifest.product, 'PRISM');
    assert.equal(manifest.architecture, 'PRISM_NATIVE_V1');
    assert.equal(manifest.legacyParent, null);
    for (const file of [...PRISM_RUNTIME_FILES, ...PRISM_ASSETS]) {
      const source = await readFile(join(repoRoot, 'prism', file));
      let expected = source;
      if (file === 'hub-bridge.mjs') expected = Buffer.from(source.toString('utf8').replace('../lighthouse-next/control-port/', './control-port/'));
      if (file === 'product-runtime.mjs') expected = Buffer.from(source.toString('utf8').replaceAll("from '../greenfield/", "from './engine/greenfield/").replaceAll("from '../lighthouse-next/", "from './engine/lighthouse-next/"));
      assert.deepEqual(await readFile(join(destinationRoot, 'prism', file)), expected, file);
    }
    for (const tree of ['lighthouse', 'lighthouse-next', 'greenfield', 'ui', 'worker', 'preview.html']) {
      await assert.rejects(stat(join(destinationRoot, tree)), { code: 'ENOENT' });
    }
    for (const file of ['control-port-transport.mjs', 'control-port-credential.mjs']) {
      assert.deepEqual(await readFile(join(destinationRoot, 'prism/control-port', file)), await readFile(join(repoRoot, 'lighthouse-next/control-port', file)));
    }
    const app = await readFile(join(destinationRoot, 'prism/app.mjs'), 'utf8');
    for (const match of app.matchAll(/from\s+['"](\.[^'"]+\.mjs)['"]/g)) {
      await stat(join(destinationRoot, 'prism', match[1]));
    }
  } finally { await rm(destinationRoot, { recursive: true, force: true }); }
});
