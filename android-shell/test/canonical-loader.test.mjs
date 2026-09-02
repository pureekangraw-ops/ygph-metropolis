import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');

async function loadBuilder() {
  return import('../tools/build-effective-base-manifest.mjs');
}

test('Android staging preserves the proven direct app startup entry', async () => {
  const staging = await read('tools/stage-existing-full-app.mjs');
  assert.doesNotMatch(staging, /canonical-bootstrap\.mjs/);
  const sourceIndex = await read('../index.html');
  assert.match(sourceIndex, /src="ui\/master-input\.mjs"/);
  assert.match(sourceIndex, /src="app\.mjs"/);
});

test('snapshot and trust evidence files cannot be changed by an ordinary patch', async () => {
  const { isPatchableEffectivePath } = await loadBuilder();
  assert.equal(isPatchableEffectivePath('index.html'), false);
  assert.equal(isPatchableEffectivePath('patch/canonical-bootstrap.mjs'), false);
  assert.equal(isPatchableEffectivePath('patch/effective-snapshot.mjs'), false);
  assert.equal(isPatchableEffectivePath('sw.js'), false);
  assert.equal(isPatchableEffectivePath('app.mjs'), true);
  assert.equal(isPatchableEffectivePath('ui/app.mjs'), true);
});

test('service worker is only a shell cache and never resolves CURRENT_SNAPSHOT runtime code', async () => {
  const worker = await read('../sw.js');
  assert.match(worker, /CACHE|SHELL|cache/i);
  assert.doesNotMatch(worker, /lighthouse-effective-snapshots-v1|currentSnapshotId|CURRENT_SNAPSHOT|PATCH_SNAPSHOT_HASH_MISMATCH|SNAPSHOT_FILE_HASH_MISMATCH/);
});
