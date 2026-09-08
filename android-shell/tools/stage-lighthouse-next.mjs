import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RUNTIME_FILES = Object.freeze([
  'index.html',
  'styles.css',
  'owner-polish.css',
  'app.mjs',
  'send-control.mjs',
  'general-income.mjs',
  'store-sale.mjs',
  'bangkok-date.mjs',
  'manifest.webmanifest',
]);

const REQUIRED_ASSETS = Object.freeze([
  'assets/lighthouse-icon.svg',
  'assets/lighthouse-icon-maskable.svg',
]);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function stageLighthouseNext({ repoRoot, shellRoot }) {
  const sourceRoot = join(repoRoot, 'lighthouse-next');
  const wwwRoot = join(shellRoot, 'www');

  for (const relative of [...RUNTIME_FILES, ...REQUIRED_ASSETS]) {
    if (!(await exists(join(sourceRoot, relative)))) {
      throw new Error(`LIGHTHOUSE_NEXT_SOURCE_MISSING:${relative}`);
    }
  }

  await rm(wwwRoot, { recursive: true, force: true });
  await mkdir(wwwRoot, { recursive: true });

  for (const relative of RUNTIME_FILES) {
    const destination = join(wwwRoot, relative);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(sourceRoot, relative), destination, { force: true });
  }

  await cp(join(sourceRoot, 'assets'), join(wwwRoot, 'assets'), {
    recursive: true,
    force: true,
  });

  return { stagedFiles: [...RUNTIME_FILES, 'assets/'] };
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath === modulePath) {
  const shellRoot = resolve(dirname(modulePath), '..');
  const repoRoot = resolve(shellRoot, '..');
  await stageLighthouseNext({ repoRoot, shellRoot });
  console.log('Staged lighthouse-next runtime for Android');
}
