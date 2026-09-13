import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIGHTHOUSE_RUNTIME_FILES = Object.freeze([
  'index.html',
  'setup.html',
  'styles.css',
  'owner-polish.css',
  'app.mjs',
  'setup.mjs',
  'view-model.mjs',
  'runtime-gate.mjs',
  'runtime-ledger.mjs',
  'runtime-store.mjs',
  'send-control.mjs',
  'general-income.mjs',
  'store-product.mjs',
  'store-sale.mjs',
  'chat-intent.mjs',
  'chat-intent-recovery.mjs',
  'bangkok-date.mjs',
  'manifest.webmanifest',
]);

export const GREENFIELD_ENTRYPOINTS = Object.freeze([
  'runtime.mjs',
  'runtime-session.mjs',
  'calculation-authority.mjs',
  'first-run.mjs',
]);

const REQUIRED_ASSETS = Object.freeze([
  'assets/lighthouse-icon.svg',
  'assets/lighthouse-icon-maskable.svg',
]);

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+\.mjs)['"]/g;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function safeRelativeModulePath(value) {
  const relative = normalize(value).replaceAll('\\', '/');
  if (isAbsolute(relative) || relative === '..' || relative.startsWith('../')) {
    throw new Error(`GREENFIELD_STAGE_PATH_INVALID:${relative}`);
  }
  return relative;
}

export async function collectGreenfieldModuleClosure(
  greenfieldRoot,
  entrypoints = GREENFIELD_ENTRYPOINTS,
) {
  const pending = [...entrypoints];
  const seen = new Set();

  while (pending.length) {
    const relative = safeRelativeModulePath(pending.pop());
    if (seen.has(relative)) continue;

    const source = join(greenfieldRoot, relative);
    if (!(await exists(source))) {
      throw new Error(`GREENFIELD_STAGE_SOURCE_MISSING:${relative}`);
    }

    seen.add(relative);
    const text = await readFile(source, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) {
      const child = safeRelativeModulePath(join(dirname(relative), match[1]));
      pending.push(child);
    }
  }

  return [...seen].sort();
}

const ROOT_ENTRY = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LIGHTHOUSE</title><meta http-equiv="refresh" content="0;url=./lighthouse-next/index.html"></head><body><p>LIGHTHOUSE</p><script>location.replace(\'./lighthouse-next/index.html\');</script></body></html>';

export async function stageLighthouseBundle({ repoRoot, destinationRoot }) {
  const lighthouseRoot = join(repoRoot, 'lighthouse-next');
  const greenfieldRoot = join(repoRoot, 'greenfield');

  for (const relative of [...LIGHTHOUSE_RUNTIME_FILES, ...REQUIRED_ASSETS]) {
    if (!(await exists(join(lighthouseRoot, relative)))) {
      throw new Error(`LIGHTHOUSE_NEXT_SOURCE_MISSING:${relative}`);
    }
  }

  const greenfieldFiles = await collectGreenfieldModuleClosure(greenfieldRoot);

  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(join(destinationRoot, 'lighthouse-next', 'assets'), { recursive: true });
  await mkdir(join(destinationRoot, 'greenfield'), { recursive: true });
  await writeFile(join(destinationRoot, 'index.html'), ROOT_ENTRY, 'utf8');

  for (const relative of LIGHTHOUSE_RUNTIME_FILES) {
    const target = join(destinationRoot, 'lighthouse-next', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(lighthouseRoot, relative), target, { force: true });
  }

  for (const relative of REQUIRED_ASSETS) {
    const target = join(destinationRoot, 'lighthouse-next', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(lighthouseRoot, relative), target, { force: true });
  }

  for (const relative of greenfieldFiles) {
    const target = join(destinationRoot, 'greenfield', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(greenfieldRoot, relative), target, { force: true });
  }

  return {
    lighthouseFiles: [...LIGHTHOUSE_RUNTIME_FILES, ...REQUIRED_ASSETS],
    greenfieldFiles,
  };
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath === modulePath) {
  const destinationArg = process.argv[2];
  if (!destinationArg) throw new Error('LIGHTHOUSE_STAGE_DESTINATION_REQUIRED');
  const repoRoot = resolve(dirname(modulePath), '..');
  const destinationRoot = resolve(process.cwd(), destinationArg);
  const result = await stageLighthouseBundle({ repoRoot, destinationRoot });
  console.log(`Staged LIGHTHOUSE bundle (${result.lighthouseFiles.length} app files, ${result.greenfieldFiles.length} Greenfield modules)`);
}
