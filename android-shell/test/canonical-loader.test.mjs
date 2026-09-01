import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');

async function loadBuilder() {
  return import('../tools/build-effective-base-manifest.mjs');
}

test('Android staging replaces direct app scripts with one protected canonical bootstrap', async () => {
  const staging = await read('tools/stage-existing-full-app.mjs');
  assert.match(staging, /canonical-bootstrap\.mjs/);
  assert.match(staging, /ui\/master-input\.mjs/);
  assert.match(staging, /app\.mjs/);
  const bootstrap = await read('www/patch/canonical-bootstrap.mjs');
  assert.match(bootstrap, /effective-base-manifest\.json/);
  assert.match(bootstrap, /serviceWorker\.register\(['"]\.\.\/sw\.js['"]\)/);
  assert.match(bootstrap, /import\(['"]\.\.\/ui\/master-input\.mjs['"]\)/);
  assert.match(bootstrap, /import\(['"]\.\.\/app\.mjs['"]\)/);
});

test('bootstrap and trust entry cannot be removed by an ordinary Patch', async () => {
  const { isPatchableEffectivePath } = await loadBuilder();
  assert.equal(isPatchableEffectivePath('index.html'), false);
  assert.equal(isPatchableEffectivePath('patch/canonical-bootstrap.mjs'), false);
  assert.equal(isPatchableEffectivePath('sw.js'), false);
  assert.equal(isPatchableEffectivePath('app.mjs'), true);
  assert.equal(isPatchableEffectivePath('ui/app.mjs'), true);
});

test('service worker resolves effective snapshot files and has an explicit APK-base bypass', async () => {
  const worker = await read('../sw.js');
  assert.match(worker, /lighthouse-effective-snapshots-v1/);
  assert.match(worker, /lighthouse-base/);
  assert.match(worker, /currentSnapshotId/);
  assert.match(worker, /sha256/i);
  assert.match(worker, /PATCH_SNAPSHOT_HASH_MISMATCH|SNAPSHOT_FILE_HASH_MISMATCH/);
});
