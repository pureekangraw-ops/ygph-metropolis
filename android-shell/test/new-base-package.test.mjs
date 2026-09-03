import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { stageNewBase } from '../tools/stage-new-base.mjs';

test('Android staging packages NEW BASE and not legacy UI shell', async () => {
  await stageNewBase();
  const [entry, main] = await Promise.all([
    readFile(new URL('../www/lighthouse-new-base/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../www/lighthouse-new-base/main.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(entry, /\.\/main\.mjs/);
  assert.match(main, /createBrowserApp/);
  assert.match(main, /createRuntimeBoot/);
  assert.doesNotMatch(main, /\.\.\/ui\//);
  await assert.rejects(readFile(new URL('../www/ui/app.mjs', import.meta.url), 'utf8'), /ENOENT/);
  await rm(new URL('../www', import.meta.url), { recursive:true, force:true });
});
