import { PATCH_ALLOWED_FILES } from './patch-contract.mjs';
import { verifyEffectiveSnapshot } from './effective-snapshot.mjs';

const DEFAULT_DATABASE_NAME = 'lighthouse-patches-v1';
const DATABASE_VERSION = 1;
const SNAPSHOTS_STORE = 'snapshots';
const META_STORE = 'meta';
const META_KEY = 'state';

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

function normalizeSnapshot(snapshot) {
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
  const normalized = {
    version: value.version,
    assets: Object.fromEntries(PATCH_ALLOWED_FILES.map(path => [path, assets[path]])),
  };
  if (value.effectiveSnapshot != null) normalized.effectiveSnapshot = clone(value.effectiveSnapshot);
  return normalized;
}

async function validateSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  if (normalized.effectiveSnapshot) await verifyEffectiveSnapshot(normalized.effectiveSnapshot);
  return normalized;
}

function requireExpectedCurrentVersion(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Expected current patch version is required for activation');
  }
  return value;
}

function snapshotsEqual(left, right) {
  if (!left || !right || left.version !== right.version) return false;
  if (!PATCH_ALLOWED_FILES.every(path => left.assets?.[path] === right.assets?.[path])) return false;
  return JSON.stringify(left.effectiveSnapshot ?? null) === JSON.stringify(right.effectiveSnapshot ?? null);
}

function snapshotConflictError(version) {
  return new Error(`Patch snapshot version is immutable and already exists with different content: ${version}`);
}

function snapshotId(snapshot) {
  return snapshot?.effectiveSnapshot?.snapshotId ?? null;
}

function nextActivationMeta(meta, candidate, version) {
  const candidateId = snapshotId(candidate);
  if (candidate?.effectiveSnapshot?.previousSnapshotId != null
    && candidate.effectiveSnapshot.previousSnapshotId !== (meta.currentSnapshotId ?? null)) {
    throw new Error('Effective snapshot previous pointer does not match current snapshot');
  }
  return {
    currentVersion: version,
    previousVersion: meta.currentVersion,
    currentSnapshotId: candidateId,
    previousSnapshotId: meta.currentSnapshotId ?? null,
  };
}

function nextRollbackMeta(meta) {
  return {
    currentVersion: meta.previousVersion,
    previousVersion: meta.currentVersion,
    currentSnapshotId: meta.previousSnapshotId ?? null,
    previousSnapshotId: meta.currentSnapshotId ?? null,
  };
}

function initialMeta(baseSnapshot) {
  return {
    currentVersion: baseSnapshot.version,
    previousVersion: null,
    currentSnapshotId: snapshotId(baseSnapshot),
    previousSnapshotId: null,
  };
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(indexedDB, databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOTS_STORE)) database.createObjectStore(SNAPSHOTS_STORE);
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open patch database'));
  });
}

async function initializeDatabase(database, baseSnapshot) {
  const transaction = database.transaction([SNAPSHOTS_STORE, META_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const snapshots = transaction.objectStore(SNAPSHOTS_STORE);
  const metaStore = transaction.objectStore(META_STORE);
  const [existingBase, existingMeta] = await Promise.all([
    requestValue(snapshots.get(baseSnapshot.version)),
    requestValue(metaStore.get(META_KEY)),
  ]);

  if (!existingBase) snapshots.put(clone(baseSnapshot), baseSnapshot.version);
  if (!existingMeta) {
    metaStore.put(initialMeta(baseSnapshot), META_KEY);
  } else if (!Object.prototype.hasOwnProperty.call(existingMeta, 'currentSnapshotId')) {
    const current = await requestValue(snapshots.get(existingMeta.currentVersion));
    metaStore.put({
      ...existingMeta,
      currentSnapshotId: snapshotId(current),
      previousSnapshotId: null,
    }, META_KEY);
  }
  await done;
}

function stageIndexedDbSnapshot(database, candidate) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SNAPSHOTS_STORE, 'readwrite');
    const store = transaction.objectStore(SNAPSHOTS_STORE);
    const request = store.get(candidate.version);
    let stageError;

    request.onsuccess = () => {
      try {
        if (request.result) {
          const existing = normalizeSnapshot(request.result);
          if (!snapshotsEqual(existing, candidate)) throw snapshotConflictError(candidate.version);
          return;
        }
        store.add(clone(candidate), candidate.version);
      } catch (error) {
        stageError = error;
        transaction.abort();
      }
    };
    request.onerror = () => {
      stageError = request.error ?? new Error('Unable to read staged patch snapshot');
      transaction.abort();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(stageError ?? transaction.error ?? new Error('Patch snapshot transaction failed'));
    transaction.onabort = () => reject(stageError ?? transaction.error ?? new Error('Patch snapshot transaction aborted'));
  });
}

export function composeSnapshot({ currentSnapshot, baseAssets, verifiedPatch }) {
  const patch = asObject(verifiedPatch, 'Verified patch');
  if (typeof patch.version !== 'string' || patch.version.length === 0) throw new Error('Verified patch version is required');
  const files = asObject(patch.files, 'Verified patch files');
  const sourceAssets = currentSnapshot
    ? normalizeSnapshot(currentSnapshot).assets
    : asObject(baseAssets, 'Packaged base assets');

  const assets = {};
  for (const path of PATCH_ALLOWED_FILES) {
    const patched = files[path];
    const content = patched ? patched.content : sourceAssets[path];
    if (typeof content !== 'string') throw new Error(`Complete snapshot is missing asset: ${path}`);
    assets[path] = content;
  }
  return { version: patch.version, assets };
}

export function createMemoryPatchStore({ baseSnapshot }) {
  const base = normalizeSnapshot(baseSnapshot);
  const snapshots = new Map([[base.version, clone(base)]]);
  let meta = initialMeta(base);

  return {
    async stage(snapshot) {
      const candidate = await validateSnapshot(snapshot);
      const existing = snapshots.get(candidate.version);
      if (existing) {
        if (!snapshotsEqual(existing, candidate)) throw snapshotConflictError(candidate.version);
        return clone(existing);
      }
      snapshots.set(candidate.version, clone(candidate));
      return clone(candidate);
    },

    async readSnapshot(version) {
      const snapshot = snapshots.get(version);
      if (!snapshot) return null;
      return validateSnapshot(snapshot);
    },

    async readMeta() {
      return clone(meta);
    },

    async readCurrent() {
      const snapshot = snapshots.get(meta.currentVersion);
      if (!snapshot) throw new Error(`Current patch snapshot is missing: ${meta.currentVersion}`);
      return validateSnapshot(snapshot);
    },

    async activate(version, { expectedCurrentVersion } = {}) {
      const expected = requireExpectedCurrentVersion(expectedCurrentVersion);
      const candidateRaw = snapshots.get(version);
      if (!candidateRaw) throw new Error(`Staged patch snapshot is missing: ${version}`);
      const candidate = await validateSnapshot(candidateRaw);
      if (meta.currentVersion !== expected) {
        throw new Error(`Patch current version changed before activation: expected ${expected}, found ${meta.currentVersion}`);
      }
      if (version === meta.currentVersion) return clone(meta);
      meta = nextActivationMeta(meta, candidate, version);
      return clone(meta);
    },

    async rollback() {
      if (!meta.previousVersion) throw new Error('No previous patch snapshot is available for rollback');
      const previous = snapshots.get(meta.previousVersion);
      if (!previous) throw new Error(`Previous patch snapshot is missing: ${meta.previousVersion}`);
      await validateSnapshot(previous);
      meta = nextRollbackMeta(meta);
      return clone(meta);
    },
  };
}

export function createIndexedDbPatchStore({ indexedDB = globalThis.indexedDB, baseSnapshot, databaseName = DEFAULT_DATABASE_NAME } = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') throw new Error('IndexedDB is required for persistent patch storage');
  if (typeof databaseName !== 'string' || databaseName.length === 0) throw new Error('Patch database name is required');

  const base = normalizeSnapshot(baseSnapshot);
  const ready = openDatabase(indexedDB, databaseName).then(async database => {
    await initializeDatabase(database, base);
    return database;
  });

  async function readSnapshot(version) {
    const database = await ready;
    const transaction = database.transaction(SNAPSHOTS_STORE, 'readonly');
    const done = transactionDone(transaction);
    const snapshot = await requestValue(transaction.objectStore(SNAPSHOTS_STORE).get(version));
    await done;
    return snapshot ? validateSnapshot(snapshot) : null;
  }

  async function readMeta() {
    const database = await ready;
    const transaction = database.transaction(META_STORE, 'readonly');
    const done = transactionDone(transaction);
    const meta = await requestValue(transaction.objectStore(META_STORE).get(META_KEY));
    await done;
    if (!meta) throw new Error('Patch metadata is missing');
    return clone(meta);
  }

  async function mutateMeta(mutator) {
    const database = await ready;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(META_STORE, 'readwrite');
      const store = transaction.objectStore(META_STORE);
      const request = store.get(META_KEY);
      let nextMeta;
      let mutationError;
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('Patch metadata is missing');
          nextMeta = mutator(clone(request.result));
          store.put(clone(nextMeta), META_KEY);
        } catch (error) {
          mutationError = error;
          transaction.abort();
        }
      };
      request.onerror = () => {
        mutationError = request.error ?? new Error('Unable to read patch metadata');
        transaction.abort();
      };
      transaction.oncomplete = () => resolve(clone(nextMeta));
      transaction.onerror = () => reject(mutationError ?? transaction.error ?? new Error('Patch metadata transaction failed'));
      transaction.onabort = () => reject(mutationError ?? transaction.error ?? new Error('Patch metadata transaction aborted'));
    });
  }

  return {
    async stage(snapshot) {
      const candidate = await validateSnapshot(snapshot);
      const database = await ready;
      await stageIndexedDbSnapshot(database, candidate);
      const readback = await readSnapshot(candidate.version);
      if (!snapshotsEqual(candidate, readback)) throw new Error(`Staged patch snapshot readback mismatch: ${candidate.version}`);
      return readback;
    },

    readSnapshot,
    readMeta,

    async readCurrent() {
      const meta = await readMeta();
      const snapshot = await readSnapshot(meta.currentVersion);
      if (!snapshot) throw new Error(`Current patch snapshot is missing: ${meta.currentVersion}`);
      return snapshot;
    },

    async activate(version, { expectedCurrentVersion } = {}) {
      const expected = requireExpectedCurrentVersion(expectedCurrentVersion);
      const candidate = await readSnapshot(version);
      if (!candidate) throw new Error(`Staged patch snapshot is missing: ${version}`);
      const nextMeta = await mutateMeta(meta => {
        if (meta.currentVersion !== expected) {
          throw new Error(`Patch current version changed before activation: expected ${expected}, found ${meta.currentVersion}`);
        }
        if (meta.currentVersion === version) return meta;
        return nextActivationMeta(meta, candidate, version);
      });
      const metaReadback = await readMeta();
      const currentReadback = await readSnapshot(metaReadback.currentVersion);
      if (
        metaReadback.currentVersion !== nextMeta.currentVersion
        || metaReadback.previousVersion !== nextMeta.previousVersion
        || metaReadback.currentSnapshotId !== nextMeta.currentSnapshotId
        || metaReadback.previousSnapshotId !== nextMeta.previousSnapshotId
        || !snapshotsEqual(candidate, currentReadback)
      ) throw new Error(`Patch activation readback mismatch: ${version}`);
      return metaReadback;
    },

    async rollback() {
      const before = await readMeta();
      if (!before.previousVersion) throw new Error('No previous patch snapshot is available for rollback');
      const previous = await readSnapshot(before.previousVersion);
      if (!previous) throw new Error(`Previous patch snapshot is missing: ${before.previousVersion}`);
      const nextMeta = await mutateMeta(meta => {
        if (meta.currentVersion !== before.currentVersion || meta.previousVersion !== before.previousVersion) {
          throw new Error('Patch metadata changed during rollback');
        }
        return nextRollbackMeta(meta);
      });
      const metaReadback = await readMeta();
      const currentReadback = await readSnapshot(metaReadback.currentVersion);
      if (
        metaReadback.currentVersion !== nextMeta.currentVersion
        || metaReadback.previousVersion !== nextMeta.previousVersion
        || metaReadback.currentSnapshotId !== nextMeta.currentSnapshotId
        || metaReadback.previousSnapshotId !== nextMeta.previousSnapshotId
        || !snapshotsEqual(previous, currentReadback)
      ) throw new Error('Patch rollback readback mismatch');
      return metaReadback;
    },
  };
}
