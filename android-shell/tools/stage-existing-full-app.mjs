import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const shellRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(shellRoot, '..');
const wwwRoot = resolve(shellRoot, 'www');

const requiredFiles = [
  'index.html',
  'app.mjs',
  'styles.css',
  'manifest.webmanifest',
];

const optionalFiles = [
  'compact-ui.css',
  'icon-192.png',
  'icon-512.png',
];

const requiredDirectories = [
  'ui',
  'greenfield',
  'lighthouse',
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyRequired(relative) {
  const source = resolve(repoRoot, relative);
  if (!(await exists(source))) throw new Error(`EXISTING_APP_SOURCE_MISSING:${relative}`);
  await cp(source, resolve(wwwRoot, relative), { recursive: true, force: true });
}

await mkdir(wwwRoot, { recursive: true });

// Remove only previous staged/replacement application assets. Trust and Patch
// directories are deliberately preserved as Android-owned infrastructure.
for (const relative of [
  'app',
  'ui',
  'greenfield',
  'lighthouse',
  'index.html',
  'app.mjs',
  'styles.css',
  'manifest.webmanifest',
  'compact-ui.css',
  'icon-192.png',
  'icon-512.png',
]) {
  await rm(resolve(wwwRoot, relative), { recursive: true, force: true });
}

for (const relative of requiredFiles) await copyRequired(relative);
for (const relative of requiredDirectories) await copyRequired(relative);
for (const relative of optionalFiles) {
  if (await exists(resolve(repoRoot, relative))) {
    await cp(resolve(repoRoot, relative), resolve(wwwRoot, relative), { force: true });
  }
}

console.log('Staged existing repository application into android-shell/www');
