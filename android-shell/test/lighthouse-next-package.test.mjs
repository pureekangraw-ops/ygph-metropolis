import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stageLighthouseNext, RUNTIME_FILES } from '../tools/stage-lighthouse-next.mjs';

const shellRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(shellRoot, '..');

test('Android package stages the approved lighthouse-next runtime byte-identically', async () => {
  await stageLighthouseNext({ repoRoot, shellRoot });
  for (const relative of RUNTIME_FILES) {
    assert.deepEqual(
      await readFile(join(shellRoot, 'www', relative)),
      await readFile(join(repoRoot, 'lighthouse-next', relative)),
      relative,
    );
  }
  assert.deepEqual(
    await readFile(join(shellRoot, 'www/assets/lighthouse-icon.svg')),
    await readFile(join(repoRoot, 'lighthouse-next/assets/lighthouse-icon.svg')),
  );
});

test('missing lighthouse-next source fails closed instead of falling back to legacy root assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lh-stage-'));
  const repo = join(root, 'repo');
  const shell = join(repo, 'android-shell');
  await mkdir(join(repo, 'lighthouse-next', 'assets'), { recursive: true });
  await mkdir(shell, { recursive: true });
  await writeFile(join(repo, 'app.mjs'), 'legacy fallback must never package', 'utf8');

  await assert.rejects(
    stageLighthouseNext({ repoRoot: repo, shellRoot: shell }),
    /LIGHTHOUSE_NEXT_SOURCE_MISSING:index\.html/,
  );
});
