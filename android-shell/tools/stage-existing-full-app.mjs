import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { buildEffectiveBaseManifest } from './build-effective-base-manifest.mjs';

const execFileAsync = promisify(execFile);
const shellRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(shellRoot, '..');
const wwwRoot = resolve(shellRoot, 'www');

const requiredFiles = [
  'index.html',
  'app.mjs',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
];

const optionalFiles = [
  'theme.css',
  'compact-ui.css',
  'icon-192.png',
  'icon-512.png',
];

const requiredDirectories = [
  'ui',
  'greenfield',
  'lighthouse',
  'styles',
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

async function exactSourceCommit() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  const commit = stdout.trim();
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error('EXISTING_APP_SOURCE_COMMIT_INVALID');
  return commit;
}

async function apkVersionName() {
  const version = JSON.parse(await readFile(resolve(shellRoot, 'version.json'), 'utf8'));
  if (typeof version.versionName !== 'string' || !version.versionName.trim()) {
    throw new Error('EXISTING_APP_APK_VERSION_INVALID');
  }
  return version.versionName.trim();
}

await mkdir(wwwRoot, { recursive: true });

// Remove only prior staged application assets. Trust/Patch infrastructure stays
// Android-owned and is included in the effective manifest as non-patchable base.
for (const relative of [
  'app',
  'ui',
  'greenfield',
  'lighthouse',
  'styles',
  'index.html',
  'app.mjs',
  'styles.css',
  'theme.css',
  'manifest.webmanifest',
  'sw.js',
  'compact-ui.css',
  'icon-192.png',
  'icon-512.png',
  'effective-base-manifest.json',
]) {
  await rm(resolve(wwwRoot, relative), { recursive: true, force: true });
}

for (const relative of requiredFiles) await copyRequired(relative);
for (const relative of requiredDirectories) await copyRequired(relative);
for (const relative of optionalFiles) {
  if (await exists(resolve(repoRoot, relative))) {
    await cp(resolve(repoRoot, relative), resolve(wwwRoot, relative), { recursive:true, force: true });
  }
}

const [apkVersion, sourceCommit] = await Promise.all([apkVersionName(), exactSourceCommit()]);
const effectiveBaseManifest = await buildEffectiveBaseManifest({
  webRoot: wwwRoot,
  apkVersion,
  sourceCommit,
});
await writeFile(
  resolve(wwwRoot, 'effective-base-manifest.json'),
  `${JSON.stringify(effectiveBaseManifest, null, 2)}\n`,
  'utf8',
);

const readback = JSON.parse(await readFile(resolve(wwwRoot, 'effective-base-manifest.json'), 'utf8'));
if (readback.aggregateSha256 !== effectiveBaseManifest.aggregateSha256 || readback.sourceCommit !== sourceCommit) {
  throw new Error('EFFECTIVE_BASE_MANIFEST_READBACK_MISMATCH');
}

console.log(`Staged existing repository application into android-shell/www at ${sourceCommit}`);
console.log(`Effective base manifest ${effectiveBaseManifest.aggregateSha256}`);
