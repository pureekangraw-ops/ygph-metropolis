import { PATCH_ALLOWED_FILES } from './patch-contract.mjs';

function clone(value) {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function asObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function validateSnapshot(snapshot) {
  const value = asObject(snapshot, 'Patch snapshot');
  if (typeof value.version !== 'string' || value.version.length === 0) {
    throw new Error('Patch snapshot version is required');
  }
  const assets = asObject(value.assets, 'Patch snapshot assets');
  for (const path of PATCH_ALLOWED_FILES) {
    if (typeof assets[path] !== 'string') {
      throw new Error(`Complete snapshot is missing asset: ${path}`);
    }
  }
  return {
    version: value.version,
    assets: Object.fromEntries(PATCH_ALLOWED_FILES.map((path) => [path, assets[path]])),
  };
}

export function composeSnapshot({ currentSnapshot, baseAssets, verifiedPatch }) {
  const patch = asObject(verifiedPatch, 'Verified patch');
  if (typeof patch.version !== 'string' || patch.version.length === 0) {
    throw new Error('Verified patch version is required');
  }
  const files = asObject(patch.files, 'Verified patch files');
  const sourceAssets = currentSnapshot
    ? validateSnapshot(currentSnapshot).assets
    : asObject(baseAssets, 'Packaged base assets');

  const assets = {};
  for (const path of PATCH_ALLOWED_FILES) {
    const patched = files[path];
    const content = patched ? patched.content : sourceAssets[path];
    if (typeof content !== 'string') {
      throw new Error(`Complete snapshot is missing asset: ${path}`);
    }
    assets[path] = content;
  }

  return { version: patch.version, assets };
}

export function createMemoryPatchStore({ baseSnapshot }) {
  const base = validateSnapshot(baseSnapshot);
  const snapshots = new Map([[base.version, clone(base)]]);
  let meta = { currentVersion: base.version, previousVersion: null };

  return {
    async stage(snapshot) {
      const candidate = validateSnapshot(snapshot);
      snapshots.set(candidate.version, clone(candidate));
      return clone(candidate);
    },

    async readSnapshot(version) {
      const snapshot = snapshots.get(version);
      return snapshot ? clone(snapshot) : null;
    },

    async readMeta() {
      return clone(meta);
    },

    async readCurrent() {
      const snapshot = snapshots.get(meta.currentVersion);
      if (!snapshot) throw new Error(`Current patch snapshot is missing: ${meta.currentVersion}`);
      return clone(snapshot);
    },

    async activate(version) {
      if (!snapshots.has(version)) throw new Error(`Staged patch snapshot is missing: ${version}`);
      if (version === meta.currentVersion) return clone(meta);
      meta = {
        currentVersion: version,
        previousVersion: meta.currentVersion,
      };
      return clone(meta);
    },

    async rollback() {
      if (!meta.previousVersion) throw new Error('No previous patch snapshot is available for rollback');
      if (!snapshots.has(meta.previousVersion)) {
        throw new Error(`Previous patch snapshot is missing: ${meta.previousVersion}`);
      }
      const leaving = meta.currentVersion;
      meta = {
        currentVersion: meta.previousVersion,
        previousVersion: leaving,
      };
      return clone(meta);
    },
  };
}
