import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { stageLighthouseNext } from '../tools/stage-lighthouse-next.mjs';

const shellRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(shellRoot, '..');
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+\.mjs)['"]/g;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectMjsFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await collectMjsFiles(root, absolute));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(relative(root, absolute).replaceAll('\\', '/'));
  }
  return files.sort();
}

test('Android package stages LIGHTHOUSE and Greenfield runtime byte-identically in the shared bundle shape', async () => {
  await stageLighthouseNext({ repoRoot, shellRoot });

  const stagedLighthouse = join(shellRoot, 'www', 'lighthouse-next');
  const stagedGreenfield = join(shellRoot, 'www', 'greenfield');

  assert.equal(await exists(join(stagedLighthouse, 'runtime-gate.mjs')), true, 'runtime-gate.mjs must live under www/lighthouse-next');
  assert.equal(await exists(join(stagedLighthouse, 'runtime-ledger.mjs')), true, 'runtime-ledger.mjs must be staged');
  assert.equal(await exists(join(stagedGreenfield, 'runtime.mjs')), true, 'greenfield/runtime.mjs must be staged');
  assert.equal(await exists(join(stagedGreenfield, 'runtime-session.mjs')), true, 'greenfield/runtime-session.mjs must be staged');
  assert.equal(await exists(join(stagedGreenfield, 'calculation-authority.mjs')), true, 'calculation-authority.mjs must be staged');

  assert.deepEqual(
    await readFile(join(stagedLighthouse, 'runtime-gate.mjs')),
    await readFile(join(repoRoot, 'lighthouse-next', 'runtime-gate.mjs')),
  );
  assert.deepEqual(
    await readFile(join(stagedLighthouse, 'runtime-ledger.mjs')),
    await readFile(join(repoRoot, 'lighthouse-next', 'runtime-ledger.mjs')),
  );
  assert.deepEqual(
    await readFile(join(stagedGreenfield, 'runtime.mjs')),
    await readFile(join(repoRoot, 'greenfield', 'runtime.mjs')),
  );
  assert.deepEqual(
    await readFile(join(stagedGreenfield, 'runtime-session.mjs')),
    await readFile(join(repoRoot, 'greenfield', 'runtime-session.mjs')),
  );
  assert.deepEqual(
    await readFile(join(stagedGreenfield, 'calculation-authority.mjs')),
    await readFile(join(repoRoot, 'greenfield', 'calculation-authority.mjs')),
  );
});

test('every staged LIGHTHOUSE relative ES-module dependency is present in the staged bundle', async () => {
  await stageLighthouseNext({ repoRoot, shellRoot });
  const stagedLighthouse = join(shellRoot, 'www', 'lighthouse-next');
  assert.equal(await exists(stagedLighthouse), true, 'shared bundle must contain lighthouse-next');

  for (const relativeFile of await collectMjsFiles(stagedLighthouse)) {
    const source = await readFile(join(stagedLighthouse, relativeFile), 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const dependency = normalize(join(dirname(relativeFile), match[1])).replaceAll('\\', '/');
      assert.equal(
        await exists(join(stagedLighthouse, dependency)),
        true,
        `${relativeFile} is missing staged dependency ${match[1]}`,
      );
    }
  }
});

test('every staged Greenfield relative ES-module dependency is present in the staged closure', async () => {
  await stageLighthouseNext({ repoRoot, shellRoot });
  const stagedGreenfield = join(shellRoot, 'www', 'greenfield');
  assert.equal(await exists(stagedGreenfield), true, 'shared bundle must contain a greenfield directory');

  for (const relativeFile of await collectMjsFiles(stagedGreenfield)) {
    const source = await readFile(join(stagedGreenfield, relativeFile), 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const dependency = normalize(join(dirname(relativeFile), match[1])).replaceAll('\\', '/');
      assert.equal(
        await exists(join(stagedGreenfield, dependency)),
        true,
        `${relativeFile} is missing staged dependency ${match[1]}`,
      );
    }
  }
});

test('shared bundle excludes forbidden trees and legacy root app assets', async () => {
  await stageLighthouseNext({ repoRoot, shellRoot });
  const wwwRoot = join(shellRoot, 'www');
  for (const forbidden of [
    'ui',
    'release',
    'worker',
    'greenfield/first-run.mjs',
    'greenfield/import-router.mjs',
    'greenfield/master-input-router.mjs',
    'greenfield/obligation-import.mjs',
    'app.mjs',
  ]) {
    assert.equal(await exists(join(wwwRoot, forbidden)), false, `forbidden staged path: ${forbidden}`);
  }
});

test('missing lighthouse-next source fails closed instead of falling back to legacy root assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lh-stage-'));
  const repo = join(root, 'repo');
  const shell = join(repo, 'android-shell');
  await mkdir(join(repo, 'lighthouse-next', 'assets'), { recursive: true });
  await mkdir(join(repo, 'greenfield'), { recursive: true });
  await mkdir(shell, { recursive: true });
  await writeFile(join(repo, 'app.mjs'), 'legacy fallback must never package', 'utf8');

  await assert.rejects(
    stageLighthouseNext({ repoRoot: repo, shellRoot: shell }),
    /LIGHTHOUSE_NEXT_SOURCE_MISSING:index\.html/,
  );
});
