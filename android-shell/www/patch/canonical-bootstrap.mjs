import { createBaseEffectiveSnapshotFromManifest } from './canonical-overlay.mjs';
import { createIndexedDbEffectiveSnapshotStore } from './effective-store.mjs';

const DATABASE_NAME = 'lighthouse-effective-snapshots-v1';
const MANIFEST_URL = '../effective-base-manifest.json';
const BASE_BYPASS_KEY = 'lighthouse-base';
const RELOAD_GUARD = 'lighthouse.snapshot.sw-reload.v1';

function nowIso() {
  return new Date().toISOString();
}

async function requireJson(response, code) {
  if (!response?.ok || typeof response.json !== 'function') throw new Error(code);
  return response.json();
}

function baseUrl(path) {
  const url = new URL(`../${path}`, import.meta.url);
  url.searchParams.set(BASE_BYPASS_KEY, '1');
  return url;
}

async function loadBaseSnapshot(fetchImpl) {
  const manifestUrl = new URL(MANIFEST_URL, import.meta.url);
  manifestUrl.searchParams.set(BASE_BYPASS_KEY, '1');
  const manifest = await requireJson(
    await fetchImpl(manifestUrl, { cache:'no-store' }),
    'EFFECTIVE_BASE_MANIFEST_UNAVAILABLE',
  );
  const baseSnapshot = await createBaseEffectiveSnapshotFromManifest({
    manifest,
    activatedAt: nowIso(),
    fetchImpl:(path, options) => fetchImpl(baseUrl(path), options),
  });
  return { manifest, baseSnapshot };
}

function sameBase(snapshot, manifest) {
  return snapshot?.base?.apkVersion === manifest.apkVersion
    && snapshot?.base?.sourceCommit === manifest.sourceCommit;
}

async function selectVerifiedSnapshot(store, baseSnapshot, manifest) {
  let meta = await store.readMeta();
  try {
    const current = await store.readCurrent();
    if (!sameBase(current, manifest)) throw new Error('CURRENT_SNAPSHOT_BASE_MISMATCH');
    return current;
  } catch (currentError) {
    if (meta.previousSnapshotId) {
      try {
        await store.rollback();
        const previous = await store.readCurrent();
        if (!sameBase(previous, manifest)) throw new Error('PREVIOUS_SNAPSHOT_BASE_MISMATCH');
        return previous;
      } catch {
        // Fall through to packaged APK base.
      }
    }

    meta = await store.readMeta();
    if (meta.currentSnapshotId !== baseSnapshot.snapshotId) {
      await store.activate(baseSnapshot.snapshotId, { expectedCurrentSnapshotId:meta.currentSnapshotId });
    }
    const base = await store.readCurrent();
    if (!sameBase(base, manifest)) throw currentError;
    return base;
  }
}

async function ensureServiceWorker(navigatorRef, locationRef) {
  if (!navigatorRef?.serviceWorker) return { controlled:false, supported:false };
  await navigatorRef.serviceWorker.register('../sw.js');
  await navigatorRef.serviceWorker.ready;
  if (navigatorRef.serviceWorker.controller) {
    globalThis.sessionStorage?.removeItem(RELOAD_GUARD);
    return { controlled:true, supported:true };
  }

  const alreadyReloaded = globalThis.sessionStorage?.getItem(RELOAD_GUARD) === '1';
  if (!alreadyReloaded) {
    globalThis.sessionStorage?.setItem(RELOAD_GUARD, '1');
    locationRef?.reload?.();
    return { controlled:false, supported:true, reloading:true };
  }
  return { controlled:false, supported:true, reloading:false };
}

export async function startCanonicalSnapshotBootstrap({
  fetchImpl = globalThis.fetch,
  indexedDB = globalThis.indexedDB,
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('CANONICAL_BOOTSTRAP_FETCH_REQUIRED');
  const { manifest, baseSnapshot } = await loadBaseSnapshot(fetchImpl);
  const store = await createIndexedDbEffectiveSnapshotStore({
    indexedDB,
    baseSnapshot,
    databaseName:DATABASE_NAME,
  });
  const current = await selectVerifiedSnapshot(store, baseSnapshot, manifest);

  const worker = await ensureServiceWorker(navigatorRef, locationRef);
  if (worker.reloading) return { status:'RELOADING_FOR_SNAPSHOT_CONTROL', current, store };

  // Without Service Worker support we deliberately run the packaged APK base.
  // Patch overlays stay disabled rather than partially mixing files.
  if (!worker.controlled) {
    await import('../ui/master-input.mjs');
    await import('../app.mjs');
    return { status:'APK_BASE_NO_SERVICE_WORKER', current:baseSnapshot, store };
  }

  await import('../ui/master-input.mjs');
  await import('../app.mjs');
  return { status:'SNAPSHOT_ACTIVE', current, store };
}

if (typeof document !== 'undefined') {
  startCanonicalSnapshotBootstrap().catch(error => {
    console.error('LIGHTHOUSE canonical snapshot bootstrap failed', error);
    const status = document.getElementById('appStatus') || document.getElementById('gateStatus');
    if (status) status.textContent = `LIGHTHOUSE เริ่มไม่สำเร็จ: ${error.message}`;
  });
}
