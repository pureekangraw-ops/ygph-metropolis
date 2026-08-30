import { PATCH_ALLOWED_FILES, verifyPatchBundle } from './patch-contract.mjs';
import { composeSnapshot, createIndexedDbPatchStore } from './patch-store.mjs';

const BASE_VERSION_URL = './app/version.json';
const BASE_ASSET_PREFIX = './app/';
const TRUSTED_KEY_URL = './patch/trusted-key.json';
const PATCH_STYLE_ID = 'lighthouse-patch-style';

async function requireResponse(response, label) {
  if (!response?.ok) throw new Error(`Unable to load ${label}`);
  return response;
}

export async function loadBaseSnapshot({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is required to load packaged app assets');

  const versionResponse = await requireResponse(await fetchImpl(BASE_VERSION_URL), 'packaged app version');
  const versionData = await versionResponse.json();
  if (!versionData || typeof versionData.version !== 'string' || versionData.version.length === 0) {
    throw new Error('Packaged app version is invalid');
  }

  const assets = {};
  for (const path of PATCH_ALLOWED_FILES) {
    const response = await requireResponse(await fetchImpl(`${BASE_ASSET_PREFIX}${path}`), `packaged asset ${path}`);
    assets[path] = await response.text();
  }

  return { version: versionData.version, assets };
}

async function loadTrustedKey(fetchImpl) {
  const response = await requireResponse(await fetchImpl(TRUSTED_KEY_URL), 'trusted patch key');
  return response.json();
}

export async function parseSelectedPatchFile(file) {
  if (!file?.name?.toLowerCase().endsWith('.lhpatch')) {
    throw new Error('Patch file must use .lhpatch');
  }
  return JSON.parse(await file.text());
}

function defaultCreateModuleUrl(source) {
  return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
}

function defaultImportModule(url) {
  return import(url);
}

export async function mountSnapshot(snapshot, {
  root,
  documentRef = globalThis.document,
  trustedBrain = null,
  createModuleUrl = defaultCreateModuleUrl,
  importModule = defaultImportModule,
  revokeModuleUrl = (url) => URL.revokeObjectURL(url),
} = {}) {
  if (!root || typeof root !== 'object') throw new Error('App root is required');
  if (!documentRef) throw new Error('Document is required');

  const assets = snapshot?.assets;
  if (!assets || typeof assets !== 'object') throw new Error('Snapshot assets are required');
  for (const path of PATCH_ALLOWED_FILES) {
    if (typeof assets[path] !== 'string') throw new Error(`Snapshot is missing asset: ${path}`);
  }

  let rules;
  let vocabulary;
  try {
    rules = JSON.parse(assets['rules.json']);
    vocabulary = JSON.parse(assets['vocabulary.json']);
  } catch (error) {
    throw new Error(`Snapshot data JSON is invalid: ${error.message}`);
  }

  root.innerHTML = assets['ui.html'];

  let style = documentRef.getElementById(PATCH_STYLE_ID);
  if (!style) {
    style = documentRef.createElement('style');
    style.id = PATCH_STYLE_ID;
    documentRef.head.append(style);
  }
  style.textContent = assets['ui.css'];

  const moduleUrl = createModuleUrl(assets['logic.mjs']);
  let moduleCleanup;
  try {
    const module = await importModule(moduleUrl);
    if (typeof module.mount !== 'function') throw new Error('logic.mjs must export async function mount');
    moduleCleanup = await module.mount({
      root,
      rules,
      vocabulary,
      version: snapshot.version,
      brain: trustedBrain,
    });
  } catch (error) {
    revokeModuleUrl(moduleUrl);
    throw error;
  }

  return async () => {
    try {
      if (typeof moduleCleanup === 'function') await moduleCleanup();
    } finally {
      revokeModuleUrl(moduleUrl);
    }
  };
}

export async function applyPatchBundle(bundle, { store, trustedKey }) {
  const before = await store.readCurrent();
  const verified = await verifyPatchBundle(bundle, {
    currentVersion: before.version,
    trustedKey,
  });
  const candidate = composeSnapshot({
    currentSnapshot: before,
    baseAssets: before.assets,
    verifiedPatch: verified,
  });

  await store.stage(candidate);
  const staged = await store.readSnapshot(candidate.version);
  if (!staged || JSON.stringify(staged) !== JSON.stringify(candidate)) {
    throw new Error(`Staged patch snapshot readback mismatch: ${candidate.version}`);
  }

  try {
    await store.activate(candidate.version, { expectedCurrentVersion: before.version });
    const current = await store.readCurrent();
    if (current.version !== candidate.version || JSON.stringify(current) !== JSON.stringify(candidate)) {
      throw new Error(`Patch activation readback mismatch: ${candidate.version}`);
    }
    return { before, current };
  } catch (error) {
    const meta = await store.readMeta().catch(() => null);
    if (meta?.currentVersion === candidate.version && meta.previousVersion) {
      await store.rollback().catch(() => undefined);
    }
    throw error;
  }
}

export async function startPatchRuntime({
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch,
  indexedDB = globalThis.indexedDB,
  trustedBrain = null,
} = {}) {
  if (!documentRef) throw new Error('Document is required');

  const root = documentRef.getElementById('app');
  const fileInput = documentRef.getElementById('patch-file');
  const rollbackButton = documentRef.getElementById('patch-rollback');
  const status = documentRef.getElementById('patch-status');
  if (!root || !fileInput || !rollbackButton || !status) {
    throw new Error('Patch bootstrap controls are missing');
  }

  const baseSnapshot = await loadBaseSnapshot({ fetchImpl });
  const store = createIndexedDbPatchStore({ indexedDB, baseSnapshot });
  let cleanup = async () => {};

  const render = async (snapshot) => {
    await cleanup();
    cleanup = await mountSnapshot(snapshot, { root, documentRef, trustedBrain });
    status.textContent = `Web snapshot ${snapshot.version}`;
  };

  await render(await store.readCurrent());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    let attemptedVersion = null;
    status.textContent = 'กำลังตรวจ Patch…';

    try {
      const bundle = await parseSelectedPatchFile(file);
      attemptedVersion = bundle?.version ?? null;
      const trustedKey = await loadTrustedKey(fetchImpl);
      const { before, current } = await applyPatchBundle(bundle, { store, trustedKey });

      try {
        await render(current);
      } catch (mountError) {
        await store.rollback();
        await render(before);
        throw new Error(`Patch mount failed and was rolled back: ${mountError.message}`);
      }
      status.textContent = `Patch ${current.version} ใช้งานแล้ว`;
    } catch (error) {
      if (attemptedVersion) {
        const meta = await store.readMeta().catch(() => null);
        if (meta?.currentVersion === attemptedVersion && meta.previousVersion) {
          await store.rollback().catch(() => undefined);
          await render(await store.readCurrent()).catch(() => undefined);
        }
      }
      status.textContent = `Patch ถูกปฏิเสธ: ${error.message}`;
    } finally {
      fileInput.value = '';
    }
  });

  rollbackButton.addEventListener('click', async () => {
    status.textContent = 'กำลังย้อน Patch…';
    try {
      await store.rollback();
      const current = await store.readCurrent();
      await render(current);
      status.textContent = `ย้อนกลับเป็น ${current.version} แล้ว`;
    } catch (error) {
      status.textContent = `ย้อน Patch ไม่สำเร็จ: ${error.message}`;
    }
  });

  return { store, getCurrent: () => store.readCurrent() };
}

if (typeof document !== 'undefined') {
  const launch = () => startPatchRuntime().catch((error) => {
    const status = document.getElementById('patch-status');
    if (status) status.textContent = `LIGHTHOUSE เริ่มไม่สำเร็จ: ${error.message}`;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', launch, { once: true });
  } else {
    launch();
  }
}
