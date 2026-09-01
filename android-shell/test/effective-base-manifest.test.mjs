import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function loadBuilder() {
  try {
    return await import('../tools/build-effective-base-manifest.mjs');
  } catch (error) {
    assert.fail(`effective base manifest builder is required: ${error?.code ?? error?.message ?? error}`);
  }
}

async function put(root, path, content) {
  const full = join(root, path);
  await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive:true }).catch(() => undefined);
  await writeFile(full, content);
}

test('base manifest describes full staged web state and locks trust-engine files out of Patch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lighthouse-effective-base-'));
  try {
    await put(root, 'index.html', '<title>LIGHTHOUSE</title>');
    await put(root, 'app.mjs', "import './ui/app.mjs';");
    await put(root, 'styles.css', 'body{}');
    await put(root, 'ui/app.mjs', 'export const ui=true;');
    await put(root, 'lighthouse/intent-vocabulary.mjs', 'export const words=[];');
    await put(root, 'greenfield/runtime.mjs', 'export const runtime=true;');
    await put(root, 'patch/patch-runtime.mjs', 'export const patch=true;');
    await put(root, 'trusted/bootstrap.mjs', 'export const trusted=true;');
    await put(root, 'sw.js', 'self.addEventListener("fetch",()=>{});');

    const { buildEffectiveBaseManifest } = await loadBuilder();
    const manifest = await buildEffectiveBaseManifest({
      webRoot: root,
      apkVersion: '1.0.3',
      sourceCommit: '84a6f132880d46475b563f75d6c224184e5e56ff',
    });

    assert.equal(manifest.schema, 'lighthouse.effective-base.v1');
    assert.equal(manifest.apkVersion, '1.0.3');
    assert.equal(manifest.sourceCommit, '84a6f132880d46475b563f75d6c224184e5e56ff');
    for (const path of ['index.html','app.mjs','styles.css','ui/app.mjs','lighthouse/intent-vocabulary.mjs','greenfield/runtime.mjs','patch/patch-runtime.mjs','trusted/bootstrap.mjs','sw.js']) {
      assert.match(manifest.files[path].sha256, /^[a-f0-9]{64}$/);
    }
    assert.equal(manifest.files['ui/app.mjs'].patchable, true);
    assert.equal(manifest.files['lighthouse/intent-vocabulary.mjs'].patchable, true);
    assert.equal(manifest.files['greenfield/runtime.mjs'].patchable, false);
    assert.equal(manifest.files['patch/patch-runtime.mjs'].patchable, false);
    assert.equal(manifest.files['trusted/bootstrap.mjs'].patchable, false);
    assert.equal(manifest.files['sw.js'].patchable, false);
    assert.match(manifest.aggregateSha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive:true, force:true });
  }
});
