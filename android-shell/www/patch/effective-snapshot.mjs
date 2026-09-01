const encoder = new TextEncoder();
const SHA256_HEX = /^[a-f0-9]{64}$/u;

function subtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SNAPSHOT_CRYPTO_UNAVAILABLE');
  return subtle;
}

async function sha256Hex(text) {
  const digest = await subtleCrypto().digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code);
  return value;
}

function canonicalManifest(snapshot) {
  return JSON.stringify({
    version: snapshot.version,
    base: snapshot.base,
    patchChain: snapshot.patchChain,
    previousSnapshotId: snapshot.previousSnapshotId,
    activatedAt: snapshot.activatedAt,
    files: Object.keys(snapshot.files).sort().map(path => ({
      path,
      source: snapshot.files[path].source,
      patchId: snapshot.files[path].patchId ?? null,
      sha256: snapshot.files[path].sha256,
    })),
  });
}

export async function createEffectiveSnapshot({ version, base, files, patchChain = [], previousSnapshotId = null, activatedAt }) {
  requireString(version, 'SNAPSHOT_VERSION_REQUIRED');
  if (!base || typeof base !== 'object') throw new Error('SNAPSHOT_BASE_REQUIRED');
  requireString(base.apkVersion, 'SNAPSHOT_BASE_APK_VERSION_REQUIRED');
  requireString(base.sourceCommit, 'SNAPSHOT_BASE_SOURCE_COMMIT_REQUIRED');
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length === 0) throw new Error('SNAPSHOT_FILES_REQUIRED');
  if (!Array.isArray(patchChain)) throw new Error('SNAPSHOT_PATCH_CHAIN_INVALID');
  if (previousSnapshotId != null && typeof previousSnapshotId !== 'string') throw new Error('SNAPSHOT_PREVIOUS_ID_INVALID');
  requireString(activatedAt, 'SNAPSHOT_ACTIVATED_AT_REQUIRED');

  const effectiveFiles = {};
  for (const path of Object.keys(files).sort()) {
    const input = files[path];
    if (!input || typeof input !== 'object') throw new Error(`SNAPSHOT_FILE_INVALID:${path}`);
    requireString(input.content, `SNAPSHOT_FILE_CONTENT_REQUIRED:${path}`);
    if (input.source !== 'APK_BASE' && input.source !== 'PATCH') throw new Error(`SNAPSHOT_FILE_SOURCE_INVALID:${path}`);
    if (input.source === 'PATCH') requireString(input.patchId, `SNAPSHOT_PATCH_ID_REQUIRED:${path}`);
    effectiveFiles[path] = {
      content: input.content,
      source: input.source,
      ...(input.patchId ? { patchId: input.patchId } : {}),
      sha256: await sha256Hex(input.content),
    };
  }

  const draft = {
    snapshotId: '',
    version,
    status: 'VERIFIED',
    base: { apkVersion: base.apkVersion, sourceCommit: base.sourceCommit },
    patchChain: [...patchChain],
    previousSnapshotId,
    activatedAt,
    files: effectiveFiles,
    aggregateSha256: '',
  };
  draft.aggregateSha256 = await sha256Hex(canonicalManifest(draft));
  draft.snapshotId = `SNAP-${draft.aggregateSha256.slice(0, 16).toUpperCase()}`;
  return freezeDeep(draft);
}

export async function verifyEffectiveSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('SNAPSHOT_INVALID');
  if (snapshot.status !== 'VERIFIED') throw new Error('SNAPSHOT_STATUS_INVALID');
  requireString(snapshot.snapshotId, 'SNAPSHOT_ID_REQUIRED');
  if (!SHA256_HEX.test(snapshot.aggregateSha256 ?? '')) throw new Error('SNAPSHOT_AGGREGATE_HASH_INVALID');
  if (!snapshot.files || typeof snapshot.files !== 'object') throw new Error('SNAPSHOT_FILES_REQUIRED');

  for (const [path, file] of Object.entries(snapshot.files)) {
    if (!file || typeof file.content !== 'string' || !SHA256_HEX.test(file.sha256 ?? '')) throw new Error(`SNAPSHOT_FILE_INVALID:${path}`);
    const actual = await sha256Hex(file.content);
    if (actual !== file.sha256) throw new Error(`SNAPSHOT_FILE_HASH_MISMATCH:${path}`);
  }
  const aggregate = await sha256Hex(canonicalManifest(snapshot));
  if (aggregate !== snapshot.aggregateSha256) throw new Error('SNAPSHOT_AGGREGATE_HASH_MISMATCH');
  const expectedId = `SNAP-${aggregate.slice(0, 16).toUpperCase()}`;
  if (snapshot.snapshotId !== expectedId) throw new Error('SNAPSHOT_ID_MISMATCH');
  return true;
}
