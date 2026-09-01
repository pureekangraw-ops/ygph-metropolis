import { verifyEffectiveSnapshot } from './effective-snapshot.mjs';

const DEFAULT_DATABASE_NAME = 'lighthouse-patches-v1';
const DATABASE_VERSION = 1;
const SNAPSHOTS_STORE = 'snapshots';
const META_STORE = 'meta';
const EFFECTIVE_META_KEY = 'effective-state-v1';

function clone(value) {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function validSnapshot(snapshot) {
  await verifyEffectiveSnapshot(snapshot);
  return clone(snapshot);
}

function requireExpectedSnapshotId(value) {
  if (typeof value !== 'string' || !value) throw new Error('EXPECTED_CURRENT_SNAPSHOT_ID_REQUIRED');
  return value;
}

function nextMeta(currentSnapshotId, nextSnapshotId) {
  return {
    currentSnapshotId: nextSnapshotId,
    previousSnapshotId: currentSnapshotId,
  };
}

export async function createMemoryEffectiveSnapshotStore({ baseSnapshot } = {}) {
  const base = await validSnapshot(baseSnapshot);
  const snapshots = new Map([[base.snapshotId, base]]);
  let meta = { currentSnapshotId: base.snapshotId, previousSnapshotId: null };

  return Object.freeze({
    async stage(snapshot) {
      const candidate = await validSnapshot(snapshot);
      const existing = snapshots.get(candidate.snapshotId);
      if (existing) {
        if (!sameSnapshot(existing, candidate)) throw new Error(`EFFECTIVE_SNAPSHOT_IMMUTABLE_CONFLICT:${candidate.snapshotId}`);
        return clone(existing);
      }
      snapshots.set(candidate.snapshotId, clone(candidate));
      return clone(candidate);
    },

    async readSnapshot(snapshotId) {
      const found = snapshots.get(snapshotId);
      if (!found) return null;
      await verifyEffectiveSnapshot(found);
      return clone(found);
    },

    async readMeta() {
      return clone(meta);
    },

    async readCurrent() {
      const found = snapshots.get(meta.currentSnapshotId);
      if (!found) throw new Error(`CURRENT_EFFECTIVE_SNAPSHOT_MISSING:${meta.currentSnapshotId}`);
      await verifyEffectiveSnapshot(found);
      return clone(found);
    },

    async activate(snapshotId, { expectedCurrentSnapshotId } = {}) {
      const expected = requireExpectedSnapshotId(expectedCurrentSnapshotId);
      if (meta.currentSnapshotId !== expected) {
        throw new Error(`CURRENT_EFFECTIVE_SNAPSHOT_CHANGED:expected=${expected}:actual=${meta.currentSnapshotId}`);
      }
      const candidate = snapshots.get(snapshotId);
      if (!candidate) throw new Error(`STAGED_EFFECTIVE_SNAPSHOT_MISSING:${snapshotId}`);
      await verifyEffectiveSnapshot(candidate);
      if (candidate.previousSnapshotId != null && candidate.previousSnapshotId !== meta.currentSnapshotId) {
        throw new Error('EFFECTIVE_SNAPSHOT_PREVIOUS_POINTER_MISMATCH');
      }
      if (snapshotId === meta.currentSnapshotId) return clone(meta);
      meta = nextMeta(meta.currentSnapshotId, snapshotId);
      return clone(meta);
    },

    async rollback() {
      if (!meta.previousSnapshotId) throw new Error('NO_PREVIOUS_EFFECTIVE_SNAPSHOT');
      const previous = snapshots.get(meta.previousSnapshotId);
      if (!previous) throw new Error(`PREVIOUS_EFFECTIVE_SNAPSHOT_MISSING:${meta.previousSnapshotId}`);
      await verifyEffectiveSnapshot(previous);
      meta = nextMeta(meta.currentSnapshotId, meta.previousSnapshotId);
      return clone(meta);
    },
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('INDEXEDDB_REQUEST_FAILED'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('INDEXEDDB_TRANSACTION_FAILED'));
    transaction.onabort = () => reject(transaction.error ?? new Error('INDEXEDDB_TRANSACTION_ABORTED'));
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
    request.onerror = () => reject(request.error ?? new Error('EFFECTIVE_SNAPSHOT_DATABASE_OPEN_FAILED'));
  });
}

export async function createIndexedDbEffectiveSnapshotStore({
  indexedDB = globalThis.indexedDB,
  baseSnapshot,
  databaseName = DEFAULT_DATABASE_NAME,
} = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') throw new Error('INDEXEDDB_REQUIRED');
  if (typeof databaseName !== 'string' || !databaseName) throw new Error('EFFECTIVE_SNAPSHOT_DATABASE_NAME_REQUIRED');
  const base = await validSnapshot(baseSnapshot);
  const database = await openDatabase(indexedDB, databaseName);

  {
    const transaction = database.transaction([SNAPSHOTS_STORE, META_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const snapshots = transaction.objectStore(SNAPSHOTS_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    const [storedBase, storedMeta] = await Promise.all([
      requestValue(snapshots.get(base.snapshotId)),
      requestValue(metaStore.get(EFFECTIVE_META_KEY)),
    ]);
    if (!storedBase) snapshots.put(clone(base), base.snapshotId);
    if (!storedMeta) metaStore.put({ currentSnapshotId:base.snapshotId, previousSnapshotId:null }, EFFECTIVE_META_KEY);
    await done;
  }

  async function readSnapshot(snapshotId) {
    const transaction = database.transaction(SNAPSHOTS_STORE, 'readonly');
    const done = transactionDone(transaction);
    const found = await requestValue(transaction.objectStore(SNAPSHOTS_STORE).get(snapshotId));
    await done;
    if (!found) return null;
    await verifyEffectiveSnapshot(found);
    return clone(found);
  }

  async function readMeta() {
    const transaction = database.transaction(META_STORE, 'readonly');
    const done = transactionDone(transaction);
    const meta = await requestValue(transaction.objectStore(META_STORE).get(EFFECTIVE_META_KEY));
    await done;
    if (!meta) throw new Error('EFFECTIVE_SNAPSHOT_META_MISSING');
    return clone(meta);
  }

  async function writeMeta(mutator) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(META_STORE, 'readwrite');
      const store = transaction.objectStore(META_STORE);
      const request = store.get(EFFECTIVE_META_KEY);
      let next;
      let failure;
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('EFFECTIVE_SNAPSHOT_META_MISSING');
          next = mutator(clone(request.result));
          store.put(clone(next), EFFECTIVE_META_KEY);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      request.onerror = () => {
        failure = request.error ?? new Error('EFFECTIVE_SNAPSHOT_META_READ_FAILED');
        transaction.abort();
      };
      transaction.oncomplete = () => resolve(clone(next));
      transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('EFFECTIVE_SNAPSHOT_META_WRITE_FAILED'));
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('EFFECTIVE_SNAPSHOT_META_WRITE_ABORTED'));
    });
  }

  return Object.freeze({
    async stage(snapshot) {
      const candidate = await validSnapshot(snapshot);
      const existing = await readSnapshot(candidate.snapshotId);
      if (existing) {
        if (!sameSnapshot(existing, candidate)) throw new Error(`EFFECTIVE_SNAPSHOT_IMMUTABLE_CONFLICT:${candidate.snapshotId}`);
        return existing;
      }
      const transaction = database.transaction(SNAPSHOTS_STORE, 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(SNAPSHOTS_STORE).add(clone(candidate), candidate.snapshotId);
      await done;
      const readback = await readSnapshot(candidate.snapshotId);
      if (!readback || !sameSnapshot(readback, candidate)) throw new Error(`EFFECTIVE_SNAPSHOT_STAGE_READBACK_MISMATCH:${candidate.snapshotId}`);
      return readback;
    },

    readSnapshot,
    readMeta,

    async readCurrent() {
      const meta = await readMeta();
      const current = await readSnapshot(meta.currentSnapshotId);
      if (!current) throw new Error(`CURRENT_EFFECTIVE_SNAPSHOT_MISSING:${meta.currentSnapshotId}`);
      return current;
    },

    async activate(snapshotId, { expectedCurrentSnapshotId } = {}) {
      const expected = requireExpectedSnapshotId(expectedCurrentSnapshotId);
      const candidate = await readSnapshot(snapshotId);
      if (!candidate) throw new Error(`STAGED_EFFECTIVE_SNAPSHOT_MISSING:${snapshotId}`);
      const next = await writeMeta(meta => {
        if (meta.currentSnapshotId !== expected) {
          throw new Error(`CURRENT_EFFECTIVE_SNAPSHOT_CHANGED:expected=${expected}:actual=${meta.currentSnapshotId}`);
        }
        if (candidate.previousSnapshotId != null && candidate.previousSnapshotId !== meta.currentSnapshotId) {
          throw new Error('EFFECTIVE_SNAPSHOT_PREVIOUS_POINTER_MISMATCH');
        }
        if (snapshotId === meta.currentSnapshotId) return meta;
        return nextMeta(meta.currentSnapshotId, snapshotId);
      });
      const readback = await readMeta();
      if (readback.currentSnapshotId !== next.currentSnapshotId || readback.previousSnapshotId !== next.previousSnapshotId) {
        throw new Error('EFFECTIVE_SNAPSHOT_ACTIVATION_READBACK_MISMATCH');
      }
      return readback;
    },

    async rollback() {
      const before = await readMeta();
      if (!before.previousSnapshotId) throw new Error('NO_PREVIOUS_EFFECTIVE_SNAPSHOT');
      const previous = await readSnapshot(before.previousSnapshotId);
      if (!previous) throw new Error(`PREVIOUS_EFFECTIVE_SNAPSHOT_MISSING:${before.previousSnapshotId}`);
      const next = await writeMeta(meta => {
        if (meta.currentSnapshotId !== before.currentSnapshotId || meta.previousSnapshotId !== before.previousSnapshotId) {
          throw new Error('EFFECTIVE_SNAPSHOT_META_CHANGED_DURING_ROLLBACK');
        }
        return nextMeta(meta.currentSnapshotId, meta.previousSnapshotId);
      });
      const readback = await readMeta();
      if (readback.currentSnapshotId !== next.currentSnapshotId || readback.previousSnapshotId !== next.previousSnapshotId) {
        throw new Error('EFFECTIVE_SNAPSHOT_ROLLBACK_READBACK_MISMATCH');
      }
      return readback;
    },
  });
}
