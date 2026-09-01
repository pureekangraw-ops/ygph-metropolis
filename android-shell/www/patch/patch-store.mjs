import { PATCH_ALLOWED_FILES } from './patch-contract.mjs';

const DEFAULT_DATABASE_NAME = 'lighthouse-patches-v1';
const DATABASE_VERSION = 1;
const SNAPSHOTS_STORE = 'snapshots';
const META_STORE = 'meta';
const META_KEY = 'state';
const LEGACY_BY_CANONICAL = Object.freeze({
  'app/ui.html':'ui.html',
  'app/ui.css':'ui.css',
  'app/logic.mjs':'logic.mjs',
  'app/rules.json':'rules.json',
  'app/vocabulary.json':'vocabulary.json',
});
const ACCEPTED_ASSET_PATHS = new Set([...PATCH_ALLOWED_FILES, ...Object.values(LEGACY_BY_CANONICAL)]);

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

function effectiveAsset(assets, canonicalPath) {
  const direct = assets[canonicalPath];
  if (typeof direct === 'string') return direct;
  return assets[LEGACY_BY_CANONICAL[canonicalPath]];
}

function usesCanonicalNamespace(assets) {
  return PATCH_ALLOWED_FILES.some(path => Object.prototype.hasOwnProperty.call(assets, path));
}

function validateSnapshot(snapshot) {
  const value = asObject(snapshot, 'Patch snapshot');
  if (typeof value.version !== 'string' || value.version.length === 0) {
    throw new Error('Patch snapshot version is required');
  }
  const assets = asObject(value.assets, 'Patch snapshot assets');
  for (const path of Object.keys(assets)) {
    if (!ACCEPTED_ASSET_PATHS.has(path)) throw new Error(`Unsupported snapshot asset path: ${path}`);
  }
  for (const path of PATCH_ALLOWED_FILES) {
    if (typeof effectiveAsset(assets, path) !== 'string') {
      throw new Error(`Complete snapshot is missing asset: ${path}`);
    }
  }
  return { version:value.version, assets:clone(assets) };
}

function requireExpectedCurrentVersion(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Expected current patch version is required for activation');
  }
  return value;
}

function snapshotsEqual(left, right) {
  if (!left || !right || left.version !== right.version) return false;
  return PATCH_ALLOWED_FILES.every(path => effectiveAsset(left.assets ?? {}, path) === effectiveAsset(right.assets ?? {}, path));
}

function snapshotConflictError(version) {
  return new Error(`Patch snapshot version is immutable and already exists with different content: ${version}`);
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
  if (!existingMeta) metaStore.put({ currentVersion:baseSnapshot.version, previousVersion:null }, META_KEY);
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
          const existing = validateSnapshot(request.result);
          if (!snapshotsEqual(existing, candidate)) throw snapshotConflictError(candidate.version);
          return;
        }
        store.add(clone(candidate), candidate.version);
      } catch (error) { stageError = error; transaction.abort(); }
    };
    request.onerror = () => { stageError = request.error ?? new Error('Unable to read staged patch snapshot'); transaction.abort(); };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(stageError ?? transaction.error ?? new Error('Patch snapshot transaction failed'));
    transaction.onabort = () => reject(stageError ?? transaction.error ?? new Error('Patch snapshot transaction aborted'));
  });
}

export function composeSnapshot({ currentSnapshot, baseAssets, verifiedPatch }) {
  const patch = asObject(verifiedPatch, 'Verified patch');
  if (typeof patch.version !== 'string' || patch.version.length === 0) throw new Error('Verified patch version is required');
  const files = asObject(patch.files, 'Verified patch files');
  const sourceSnapshot = currentSnapshot ? validateSnapshot(currentSnapshot) : { version:'BASE', assets:asObject(baseAssets, 'Packaged base assets') };
  const sourceAssets = sourceSnapshot.assets;
  const canonicalOutput = usesCanonicalNamespace(sourceAssets) || Object.keys(files).some(path => PATCH_ALLOWED_FILES.includes(path));
  const assets = {};
  for (const canonicalPath of PATCH_ALLOWED_FILES) {
    const legacyPath = LEGACY_BY_CANONICAL[canonicalPath];
    const patched = files[canonicalPath] ?? files[legacyPath];
    const content = patched ? patched.content : effectiveAsset(sourceAssets, canonicalPath);
    if (typeof content !== 'string') throw new Error(`Complete snapshot is missing asset: ${canonicalPath}`);
    assets[canonicalOutput ? canonicalPath : legacyPath] = content;
  }
  return { version:patch.version, assets };
}

export function createMemoryPatchStore({ baseSnapshot }) {
  const base = validateSnapshot(baseSnapshot);
  const snapshots = new Map([[base.version, clone(base)]]);
  let meta = { currentVersion:base.version, previousVersion:null };
  return {
    async stage(snapshot) {
      const candidate = validateSnapshot(snapshot);
      const existing = snapshots.get(candidate.version);
      if (existing) {
        if (!snapshotsEqual(existing, candidate)) throw snapshotConflictError(candidate.version);
        return clone(existing);
      }
      snapshots.set(candidate.version, clone(candidate));
      return clone(candidate);
    },
    async readSnapshot(version) { const snapshot=snapshots.get(version); return snapshot ? clone(snapshot) : null; },
    async readMeta() { return clone(meta); },
    async readCurrent() { const snapshot=snapshots.get(meta.currentVersion); if(!snapshot)throw new Error(`Current patch snapshot is missing: ${meta.currentVersion}`); return clone(snapshot); },
    async activate(version,{expectedCurrentVersion}={}) {
      const expected=requireExpectedCurrentVersion(expectedCurrentVersion);
      if(!snapshots.has(version))throw new Error(`Staged patch snapshot is missing: ${version}`);
      if(meta.currentVersion!==expected)throw new Error(`Patch current version changed before activation: expected ${expected}, found ${meta.currentVersion}`);
      if(version===meta.currentVersion)return clone(meta);
      meta={currentVersion:version,previousVersion:meta.currentVersion}; return clone(meta);
    },
    async rollback() {
      if(!meta.previousVersion)throw new Error('No previous patch snapshot is available for rollback');
      if(!snapshots.has(meta.previousVersion))throw new Error(`Previous patch snapshot is missing: ${meta.previousVersion}`);
      const leaving=meta.currentVersion; meta={currentVersion:meta.previousVersion,previousVersion:leaving}; return clone(meta);
    },
  };
}

export function createIndexedDbPatchStore({ indexedDB=globalThis.indexedDB, baseSnapshot, databaseName=DEFAULT_DATABASE_NAME }={}) {
  if(!indexedDB||typeof indexedDB.open!=='function')throw new Error('IndexedDB is required for persistent patch storage');
  if(typeof databaseName!=='string'||databaseName.length===0)throw new Error('Patch database name is required');
  const base=validateSnapshot(baseSnapshot);
  const ready=openDatabase(indexedDB,databaseName).then(async database=>{await initializeDatabase(database,base);return database;});
  async function readSnapshot(version){const database=await ready;const transaction=database.transaction(SNAPSHOTS_STORE,'readonly');const done=transactionDone(transaction);const snapshot=await requestValue(transaction.objectStore(SNAPSHOTS_STORE).get(version));await done;return snapshot?validateSnapshot(snapshot):null;}
  async function readMeta(){const database=await ready;const transaction=database.transaction(META_STORE,'readonly');const done=transactionDone(transaction);const meta=await requestValue(transaction.objectStore(META_STORE).get(META_KEY));await done;if(!meta)throw new Error('Patch metadata is missing');return clone(meta);}
  async function mutateMeta(mutator){const database=await ready;return new Promise((resolve,reject)=>{const transaction=database.transaction(META_STORE,'readwrite');const store=transaction.objectStore(META_STORE);const request=store.get(META_KEY);let nextMeta;let mutationError;request.onsuccess=()=>{try{if(!request.result)throw new Error('Patch metadata is missing');nextMeta=mutator(clone(request.result));store.put(clone(nextMeta),META_KEY);}catch(error){mutationError=error;transaction.abort();}};request.onerror=()=>{mutationError=request.error??new Error('Unable to read patch metadata');transaction.abort();};transaction.oncomplete=()=>resolve(clone(nextMeta));transaction.onerror=()=>reject(mutationError??transaction.error??new Error('Patch metadata transaction failed'));transaction.onabort=()=>reject(mutationError??transaction.error??new Error('Patch metadata transaction aborted'));});}
  return {
    async stage(snapshot){const candidate=validateSnapshot(snapshot);const database=await ready;await stageIndexedDbSnapshot(database,candidate);const readback=await readSnapshot(candidate.version);if(!snapshotsEqual(candidate,readback))throw new Error(`Staged patch snapshot readback mismatch: ${candidate.version}`);return readback;},
    readSnapshot,
    readMeta,
    async readCurrent(){const meta=await readMeta();const snapshot=await readSnapshot(meta.currentVersion);if(!snapshot)throw new Error(`Current patch snapshot is missing: ${meta.currentVersion}`);return snapshot;},
    async activate(version,{expectedCurrentVersion}={}){const expected=requireExpectedCurrentVersion(expectedCurrentVersion);const candidate=await readSnapshot(version);if(!candidate)throw new Error(`Staged patch snapshot is missing: ${version}`);const nextMeta=await mutateMeta(meta=>{if(meta.currentVersion!==expected)throw new Error(`Patch current version changed before activation: expected ${expected}, found ${meta.currentVersion}`);if(meta.currentVersion===version)return meta;return{currentVersion:version,previousVersion:meta.currentVersion};});const metaReadback=await readMeta();const currentReadback=await readSnapshot(metaReadback.currentVersion);if(metaReadback.currentVersion!==nextMeta.currentVersion||metaReadback.previousVersion!==nextMeta.previousVersion||!snapshotsEqual(candidate,currentReadback))throw new Error(`Patch activation readback mismatch: ${version}`);return metaReadback;},
    async rollback(){const before=await readMeta();if(!before.previousVersion)throw new Error('No previous patch snapshot is available for rollback');const previous=await readSnapshot(before.previousVersion);if(!previous)throw new Error(`Previous patch snapshot is missing: ${before.previousVersion}`);const nextMeta=await mutateMeta(meta=>{if(meta.currentVersion!==before.currentVersion||meta.previousVersion!==before.previousVersion)throw new Error('Patch metadata changed during rollback');return{currentVersion:meta.previousVersion,previousVersion:meta.currentVersion};});const metaReadback=await readMeta();const currentReadback=await readSnapshot(metaReadback.currentVersion);if(metaReadback.currentVersion!==nextMeta.currentVersion||metaReadback.previousVersion!==nextMeta.previousVersion||!snapshotsEqual(previous,currentReadback))throw new Error('Patch rollback readback mismatch');return metaReadback;},
  };
}
