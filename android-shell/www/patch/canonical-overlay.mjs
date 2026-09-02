import { createEffectiveSnapshot, verifyEffectiveSnapshot } from './effective-snapshot.mjs';

const encoder = new TextEncoder();
const SHA256_HEX = /^[a-f0-9]{64}$/u;

function asObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code);
  return value;
}

function subtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('CANONICAL_OVERLAY_CRYPTO_UNAVAILABLE');
  return subtle;
}

async function sha256Hex(text) {
  const digest = await subtleCrypto().digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validateBaseManifest(manifest) {
  const value = asObject(manifest, 'BASE_MANIFEST_REQUIRED');
  if (value.schema !== 'lighthouse.effective-base.v1') throw new Error('BASE_MANIFEST_SCHEMA_INVALID');
  requireString(value.apkVersion, 'BASE_MANIFEST_APK_VERSION_REQUIRED');
  requireString(value.sourceCommit, 'BASE_MANIFEST_SOURCE_COMMIT_REQUIRED');
  const files = asObject(value.files, 'BASE_MANIFEST_FILES_REQUIRED');
  if (Object.keys(files).length === 0) throw new Error('BASE_MANIFEST_FILES_REQUIRED');
  for (const [path, file] of Object.entries(files)) {
    requireString(path, 'BASE_MANIFEST_PATH_INVALID');
    const entry = asObject(file, `BASE_MANIFEST_FILE_INVALID:${path}`);
    if (!SHA256_HEX.test(entry.sha256 ?? '')) throw new Error(`BASE_MANIFEST_FILE_HASH_INVALID:${path}`);
    if (typeof entry.patchable !== 'boolean') throw new Error(`BASE_MANIFEST_PATCHABLE_INVALID:${path}`);
    if (entry.source !== 'APK_BASE') throw new Error(`BASE_MANIFEST_SOURCE_INVALID:${path}`);
  }
  return value;
}

async function requireResponse(response, path) {
  if (!response?.ok || typeof response.text !== 'function') throw new Error(`BASE_FILE_UNAVAILABLE:${path}`);
  return response.text();
}

export async function createBaseEffectiveSnapshotFromManifest({ manifest, fetchImpl = globalThis.fetch, activatedAt } = {}) {
  const base = validateBaseManifest(manifest);
  if (typeof fetchImpl !== 'function') throw new Error('BASE_FETCH_REQUIRED');
  requireString(activatedAt, 'BASE_SNAPSHOT_ACTIVATED_AT_REQUIRED');

  const files = {};
  for (const path of Object.keys(base.files).sort()) {
    const content = await requireResponse(await fetchImpl(path, { cache:'no-store' }), path);
    const actual = await sha256Hex(content);
    if (actual !== base.files[path].sha256) throw new Error(`BASE_FILE_HASH_MISMATCH:${path}`);
    files[path] = { content, source:'APK_BASE' };
  }

  return createEffectiveSnapshot({
    version:`APK-${base.apkVersion}`,
    base:{ apkVersion:base.apkVersion, sourceCommit:base.sourceCommit },
    files,
    patchChain:[],
    previousSnapshotId:null,
    activatedAt,
  });
}

function requirePatch(patch) {
  const value = asObject(patch, 'CANONICAL_PATCH_REQUIRED');
  requireString(value.patchId, 'CANONICAL_PATCH_ID_REQUIRED');
  requireString(value.version, 'CANONICAL_PATCH_VERSION_REQUIRED');
  const files = asObject(value.files, 'CANONICAL_PATCH_FILES_REQUIRED');
  if (Object.keys(files).length === 0) throw new Error('CANONICAL_PATCH_FILES_REQUIRED');
  return value;
}

export async function composeCanonicalEffectiveSnapshot({ currentSnapshot, manifest, patch, activatedAt } = {}) {
  await verifyEffectiveSnapshot(currentSnapshot);
  const base = validateBaseManifest(manifest);
  const change = requirePatch(patch);
  requireString(activatedAt, 'CANONICAL_PATCH_ACTIVATED_AT_REQUIRED');

  if (currentSnapshot.base?.apkVersion !== base.apkVersion || currentSnapshot.base?.sourceCommit !== base.sourceCommit) {
    throw new Error('CANONICAL_PATCH_BASE_MISMATCH');
  }

  const currentPaths = Object.keys(currentSnapshot.files).sort();
  const manifestPaths = Object.keys(base.files).sort();
  if (JSON.stringify(currentPaths) !== JSON.stringify(manifestPaths)) throw new Error('CANONICAL_SNAPSHOT_FILESET_MISMATCH');

  const files = {};
  for (const path of manifestPaths) {
    const currentFile = currentSnapshot.files[path];
    if (!currentFile || typeof currentFile.content !== 'string') throw new Error(`CANONICAL_CURRENT_FILE_MISSING:${path}`);
    const replacement = change.files[path];
    if (replacement != null) {
      if (base.files[path].patchable !== true) throw new Error(`PATCH_PATH_NOT_ALLOWED:${path}`);
      const entry = asObject(replacement, `CANONICAL_PATCH_FILE_INVALID:${path}`);
      requireString(entry.content, `CANONICAL_PATCH_FILE_CONTENT_REQUIRED:${path}`);
      files[path] = { content:entry.content, source:'PATCH', patchId:change.patchId };
      continue;
    }
    files[path] = {
      content:currentFile.content,
      source:currentFile.source,
      ...(currentFile.patchId ? { patchId:currentFile.patchId } : {}),
    };
  }

  for (const path of Object.keys(change.files)) {
    if (!Object.prototype.hasOwnProperty.call(base.files, path)) throw new Error(`PATCH_PATH_NOT_ALLOWED:${path}`);
  }

  return createEffectiveSnapshot({
    version:change.version,
    base:{ apkVersion:base.apkVersion, sourceCommit:base.sourceCommit },
    files,
    patchChain:[...(currentSnapshot.patchChain ?? []), change.patchId],
    previousSnapshotId:currentSnapshot.snapshotId,
    activatedAt,
  });
}
