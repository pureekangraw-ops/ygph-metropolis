import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const EFFECTIVE_EXTENSIONS = new Set(['.html','.css','.js','.mjs','.json','.webmanifest']);
const ROOT_PATCHABLE = new Set(['index.html','app.mjs','styles.css','theme.css','compact-ui.css']);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function extension(path) {
  const index = path.lastIndexOf('.');
  return index < 0 ? '' : path.slice(index);
}

function isEffectiveFile(path) {
  return EFFECTIVE_EXTENSIONS.has(extension(path));
}

export function isPatchableEffectivePath(path) {
  if (typeof path !== 'string' || !path) return false;
  if (path === 'sw.js') return false;
  if (path.startsWith('greenfield/')) return false;
  if (path.startsWith('patch/')) return false;
  if (path.startsWith('trusted/')) return false;
  if (ROOT_PATCHABLE.has(path)) return true;
  if (path.startsWith('ui/')) return true;
  if (path.startsWith('lighthouse/')) return true;
  if (path.startsWith('styles/')) return true;
  return false;
}

async function collectFiles(root, current = root, out = []) {
  const entries = await readdir(current, { withFileTypes:true });
  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const path = normalizePath(relative(root, full));
    if (!isEffectiveFile(path) || path === 'effective-base-manifest.json') continue;
    out.push({ path, full });
  }
  return out;
}

function requireString(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

export async function buildEffectiveBaseManifest({ webRoot, apkVersion, sourceCommit }) {
  requireString(webRoot, 'EFFECTIVE_BASE_WEB_ROOT_REQUIRED');
  const version = requireString(apkVersion, 'EFFECTIVE_BASE_APK_VERSION_REQUIRED');
  const commit = requireString(sourceCommit, 'EFFECTIVE_BASE_SOURCE_COMMIT_REQUIRED');
  const discovered = await collectFiles(webRoot);
  discovered.sort((left, right) => left.path.localeCompare(right.path));
  if (discovered.length === 0) throw new Error('EFFECTIVE_BASE_FILES_REQUIRED');

  const files = {};
  for (const { path, full } of discovered) {
    files[path] = {
      sha256: sha256(await readFile(full)),
      patchable: isPatchableEffectivePath(path),
      source: 'APK_BASE',
    };
  }

  const canonical = JSON.stringify({
    schema: 'lighthouse.effective-base.v1',
    apkVersion: version,
    sourceCommit: commit,
    files: Object.keys(files).map(path => ({ path, ...files[path] })),
  });

  return Object.freeze({
    schema: 'lighthouse.effective-base.v1',
    apkVersion: version,
    sourceCommit: commit,
    files: Object.freeze(files),
    aggregateSha256: sha256(Buffer.from(canonical, 'utf8')),
  });
}
