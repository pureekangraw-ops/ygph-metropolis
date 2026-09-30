import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stagePrismBundle } from '../tools/stage-prism.mjs';

const shellRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(shellRoot, '..');

test('PRISM staging writes a branded mobile entrypoint and keeps the runtime bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prism-stage-'));
  const isolatedShell = join(root, 'android-shell');
  await stagePrismBundle({ repoRoot, shellRoot: isolatedShell });
  const index = await readFile(join(isolatedShell, 'www', 'lighthouse-next', 'index.html'), 'utf8');
  const manifest = await readFile(join(isolatedShell, 'www', 'lighthouse-next', 'manifest.webmanifest'), 'utf8');
  assert.match(index, /<title>PRISM<\/title>/);
  assert.doesNotMatch(index, /LIGHTHOUSE/);
  assert.match(index, /prism-icon\.svg/);
  assert.match(manifest, /PRISM/);
  await stat(join(isolatedShell, 'www', 'lighthouse-next', 'assets', 'prism-icon.svg'));
  await stat(join(isolatedShell, 'www', 'greenfield', 'runtime.mjs'));
});
