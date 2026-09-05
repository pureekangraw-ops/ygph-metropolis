import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const here = import.meta.url;

test('owner packaging preserves the canonical trusted bootstrap entrypoint', async () => {
  const entrypoint = await readFile(new URL('../www/index.html', here), 'utf8');
  const stageScript = await readFile(new URL('../tools/stage-existing-full-app.mjs', here), 'utf8');

  assert.match(entrypoint, /<script\s+type="module"\s+src="\.\/trusted\/bootstrap\.mjs"><\/script>/);
  assert.doesNotMatch(entrypoint, /src="(?:\.\/)?app\.mjs"/);
  assert.doesNotMatch(entrypoint, /src="(?:\.\/)?ui\/master-input\.mjs"/);

  const requiredFilesBlock = stageScript.match(/const requiredFiles = \[([\s\S]*?)\];/)?.[1] ?? '';
  assert.doesNotMatch(requiredFilesBlock, /['"]index\.html['"]/);

  const removalBlock = stageScript.match(/for \(const relative of \[([\s\S]*?)\]\) \{/)?.[1] ?? '';
  assert.doesNotMatch(removalBlock, /['"]index\.html['"]/);
});
