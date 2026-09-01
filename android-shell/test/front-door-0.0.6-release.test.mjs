import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('released 0.0.6 remains a bounded historical no-capability-change Patch', async () => {
  const ui006 = await readFile(new URL('release/front-door-0.0.6/ui.html', root), 'utf8');
  const logic006 = await readFile(new URL('release/front-door-0.0.6/logic.mjs', root), 'utf8');
  const ui005 = await readFile(new URL('release/front-door-0.0.5/ui.html', root), 'utf8');
  const logic005 = await readFile(new URL('release/front-door-0.0.5/logic.mjs', root), 'utf8');
  assert.equal(ui006, ui005);
  assert.equal(logic006, logic005);
});
