import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('stable bootstrap hands post-unlock UI ownership to the packaged canonical host', async () => {
  const source = await readFile(new URL('../www/trusted/bootstrap.mjs', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/source\/app\/ui\/stable-ui-host\.mjs'/);
  assert.match(source, /mountStableUi\s*\(/);
  assert.doesNotMatch(source, /startTrustedPatchRuntime\s*\(/);
});
