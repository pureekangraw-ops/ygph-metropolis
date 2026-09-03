import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const logicRoot = resolve(import.meta.dirname, '../app/public/logic');

async function collectMjs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectMjs(full));
    else if (entry.isFile() && extname(entry.name) === '.mjs') files.push(full);
  }
  return files.sort();
}

test('canonical logic tree imports without missing dependencies', async () => {
  const files = await collectMjs(logicRoot);
  assert.ok(files.length > 0, 'CANONICAL_LOGIC_TREE_EMPTY');
  for (const file of files) await import(pathToFileURL(file).href);
});

test('KEEP groups exist in canonical tree', async () => {
  const files = (await collectMjs(logicRoot)).map(file => file.slice(logicRoot.length + 1).replaceAll('\\', '/'));
  for (const required of [
    'runtime/core.mjs',
    'storage/persistence.mjs',
    'runtime/command-runtime.mjs',
    'runtime/workflow-runtime.mjs',
    'runtime/workflow-invariants.mjs',
    'domains/business-workflows.mjs',
    'domains/ride-workflows.mjs',
    'domains/calculation-authority.mjs',
    'domains/projections.mjs',
    'manual/manual-four-houses.mjs',
  ]) assert.ok(files.includes(required), `MISSING_CANONICAL_KEEP:${required}`);
});
