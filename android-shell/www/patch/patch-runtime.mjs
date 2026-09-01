import { PATCH_ALLOWED_FILES, verifyPatchBundle } from './patch-contract.mjs';
import { composeSnapshot, createIndexedDbPatchStore } from './patch-store.mjs';

const BASE_VERSION_URL = './app/version.json';
const TRUSTED_KEY_URL = './patch/trusted-key.json';
const APP_STYLE_ID = 'lighthouse-canonical-app-style';
const LEGACY_BY_CANONICAL = Object.freeze({
  'app/ui.html':'ui.html',
  'app/ui.css':'ui.css',
  'app/logic.mjs':'logic.mjs',
  'app/rules.json':'rules.json',
  'app/vocabulary.json':'vocabulary.json',
});
export const TRUSTED_PATCH_MANIFEST_URL = 'https://github.com/pureekangraw-ops/ygph-metropolis/releases/latest/download/lighthouse-patch-manifest.json';

async function requireResponse(response, label) {
  if (!response?.ok) throw new Error(`Unable to load ${label}`);
  return response;
}

export function resolveSnapshotAsset(snapshot, path) {
  if (!PATCH_ALLOWED_FILES.includes(path)) throw new Error(`Unsupported canonical asset path: ${path}`);
  const assets = snapshot?.assets;
  const value = assets?.[path] ?? assets?.[LEGACY_BY_CANONICAL[path]];
  if (typeof value !== 'string') throw new Error(`Snapshot is missing canonical asset: ${path}`);
  return value;
}

export async function loadBaseSnapshot({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is required to load packaged app assets');
  const versionResponse = await requireResponse(await fetchImpl(BASE_VERSION_URL), 'packaged app version');
  const versionData = await versionResponse.json();
  if (!versionData || typeof versionData.version !== 'string' || versionData.version.length === 0) throw new Error('Packaged app version is invalid');
  const assets = {};
  for (const path of PATCH_ALLOWED_FILES) {
    const response = await requireResponse(await fetchImpl(`./${path}`), `packaged asset ${path}`);
    assets[path] = await response.text();
  }
  return { version:versionData.version, assets };
}

async function loadTrustedKey(fetchImpl) {
  const response = await requireResponse(await fetchImpl(TRUSTED_KEY_URL), 'trusted patch key');
  return response.json();
}

export async function parseSelectedPatchFile(file) {
  if (!file?.name?.toLowerCase().endsWith('.lhpatch')) throw new Error('Patch file must use .lhpatch');
  return JSON.parse(await file.text());
}

function validVersion(value) { return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value); }
function validateManifest(manifest, currentVersion) {
  if (!manifest || typeof manifest !== 'object' || !validVersion(manifest.latestVersion)) throw new Error('Patch manifest is invalid');
  if (manifest.latestVersion === currentVersion) return { latestVersion:manifest.latestVersion, baseVersion:currentVersion };
  const entry = manifest.patches?.[currentVersion];
  if (!entry || typeof entry !== 'object') throw new Error('Patch manifest does not support current baseVersion');
  const { baseVersion, patchUrl, sha256, size } = entry;
  if (baseVersion !== currentVersion || !validVersion(baseVersion)) throw new Error('Patch manifest baseVersion mismatch');
  if (typeof patchUrl !== 'string' || !patchUrl.startsWith('https://')) throw new Error('Patch manifest URL is invalid');
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Patch manifest hash is invalid');
  if (size != null && (!Number.isSafeInteger(size) || size <= 0)) throw new Error('Patch manifest size is invalid');
  return { latestVersion:manifest.latestVersion, baseVersion, patchUrl, sha256:sha256.toLowerCase(), size:size ?? null };
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Patch hash verifier unavailable');
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function fetchLatestPatch({ currentVersion, fetchImpl = globalThis.fetch, verifyDownloadedBundle = null } = {}) {
  if (!validVersion(currentVersion)) throw new Error('Current Patch version is invalid');
  if (typeof fetchImpl !== 'function') throw new Error('Patch fetch is unavailable');
  if (verifyDownloadedBundle != null && typeof verifyDownloadedBundle !== 'function') throw new Error('Patch verifier seam is invalid');
  const manifestResponse = await requireResponse(await fetchImpl(TRUSTED_PATCH_MANIFEST_URL, { cache:'no-store' }), 'Patch manifest');
  const manifest = validateManifest(await manifestResponse.json(), currentVersion);
  if (manifest.latestVersion === currentVersion) return { status:'LATEST', manifest };
  const patchResponse = await requireResponse(await fetchImpl(manifest.patchUrl, { cache:'no-store' }), 'Patch download');
  if (typeof patchResponse.arrayBuffer !== 'function') throw new Error('Patch download body is invalid');
  const bytes = await patchResponse.arrayBuffer();
  if (manifest.size != null && bytes.byteLength !== manifest.size) throw new Error('Patch download size mismatch');
  const hash = await sha256Hex(bytes);
  if (hash !== manifest.sha256) throw new Error('Patch download hash mismatch');
  let bundle;
  try { bundle = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('Patch download JSON is invalid'); }
  if (bundle?.version !== manifest.latestVersion || bundle?.baseVersion !== manifest.baseVersion) throw new Error('Patch manifest version mismatch');
  if (verifyDownloadedBundle) await verifyDownloadedBundle(bundle);
  return { status:'DOWNLOADED_VERIFIED', manifest, bundle };
}

function defaultCreateModuleUrl(source) { return URL.createObjectURL(new Blob([source], { type:'text/javascript' })); }
function defaultImportModule(url) { return import(url); }

export async function mountSnapshot(snapshot, { root, documentRef = globalThis.document, trustedBrain = null, patchUpdater = null, createModuleUrl = defaultCreateModuleUrl, importModule = defaultImportModule, revokeModuleUrl = url => URL.revokeObjectURL(url) } = {}) {
  if (!root || typeof root !== 'object') throw new Error('App root is required');
  if (!documentRef) throw new Error('Document is required');
  for (const path of PATCH_ALLOWED_FILES) resolveSnapshotAsset(snapshot, path);
  let rules; let vocabulary;
  try {
    rules = JSON.parse(resolveSnapshotAsset(snapshot, 'app/rules.json'));
    vocabulary = JSON.parse(resolveSnapshotAsset(snapshot, 'app/vocabulary.json'));
  } catch (error) {
    throw new Error(`Canonical app data JSON is invalid: ${error.message}`);
  }
  root.innerHTML = resolveSnapshotAsset(snapshot, 'app/ui.html');
  let style = documentRef.getElementById(APP_STYLE_ID);
  if (!style) { style = documentRef.createElement('style'); style.id = APP_STYLE_ID; documentRef.head.append(style); }
  style.textContent = resolveSnapshotAsset(snapshot, 'app/ui.css');
  const moduleUrl = createModuleUrl(resolveSnapshotAsset(snapshot, 'app/logic.mjs')); let moduleCleanup;
  try {
    const module = await importModule(moduleUrl);
    if (typeof module.mount !== 'function') throw new Error('app/logic.mjs must export async function mount');
    moduleCleanup = await module.mount({ root, rules, vocabulary, version:snapshot.version, ...(trustedBrain ? { brain:trustedBrain } : {}), ...(patchUpdater ? { patchUpdater } : {}) });
  } catch (error) { revokeModuleUrl(moduleUrl); throw error; }
  return async () => { try { if (typeof moduleCleanup === 'function') await moduleCleanup(); } finally { revokeModuleUrl(moduleUrl); } };
}

export async function applyPatchBundle(bundle, { store, trustedKey }) {
  const before = await store.readCurrent();
  const verified = await verifyPatchBundle(bundle, { currentVersion:before.version, trustedKey });
  const candidate = composeSnapshot({ currentSnapshot:before, baseAssets:before.assets, verifiedPatch:verified });
  await store.stage(candidate);
  const staged = await store.readSnapshot(candidate.version);
  if (!staged || JSON.stringify(staged) !== JSON.stringify(candidate)) throw new Error(`Staged patch snapshot readback mismatch: ${candidate.version}`);
  try {
    await store.activate(candidate.version, { expectedCurrentVersion:before.version });
    const current = await store.readCurrent();
    if (current.version !== candidate.version || JSON.stringify(current) !== JSON.stringify(candidate)) throw new Error(`Patch activation readback mismatch: ${candidate.version}`);
    return { before, current };
  } catch (error) {
    const meta = await store.readMeta().catch(() => null);
    if (meta?.currentVersion === candidate.version && meta.previousVersion) await store.rollback().catch(() => undefined);
    throw error;
  }
}

export async function startPatchRuntime({ documentRef = globalThis.document, fetchImpl = globalThis.fetch, indexedDB = globalThis.indexedDB, trustedBrain = null } = {}) {
  if (!documentRef) throw new Error('Document is required');
  const root = documentRef.getElementById('app'); const patchButton = documentRef.getElementById('patch-latest'); const fileInput = documentRef.getElementById('patch-file'); const rollbackButton = documentRef.getElementById('patch-rollback'); const status = documentRef.getElementById('patch-status');
  if (!root || !patchButton || !fileInput || !rollbackButton || !status) throw new Error('Patch bootstrap controls are missing');
  const baseSnapshot = await loadBaseSnapshot({ fetchImpl }); const store = createIndexedDbPatchStore({ indexedDB, baseSnapshot }); let cleanup = async () => {}; let updating = false;
  const patchUpdater = Object.freeze({
    async updateLatest() {
      if (updating) return { status:'BUSY' }; updating = true;
      try {
        const before = await store.readCurrent(); const trustedKey = await loadTrustedKey(fetchImpl);
        const fetched = await fetchLatestPatch({ currentVersion:before.version, fetchImpl, verifyDownloadedBundle:bundle => verifyPatchBundle(bundle, { currentVersion:before.version, trustedKey }) });
        if (fetched.status === 'LATEST') return fetched;
        const applied = await applyPatchBundle(fetched.bundle, { store, trustedKey }); return { status:'ACTIVATED', ...applied };
      } finally { updating = false; }
    },
    openManualPicker() { fileInput.click(); },
    rollback() { return store.rollback(); },
  });
  const render = async snapshot => { await cleanup(); cleanup = await mountSnapshot(snapshot, { root, documentRef, trustedBrain, patchUpdater }); status.textContent = `Web snapshot ${snapshot.version}`; };
  await render(await store.readCurrent());
  const runOneTap = async () => {
    status.textContent = 'กำลังตรวจ Patch ล่าสุด…';
    try {
      const result = await patchUpdater.updateLatest();
      if (result.status === 'LATEST') { status.textContent = 'เป็นเวอร์ชันล่าสุดแล้ว'; return result; }
      if (result.status === 'BUSY') return result;
      try { await render(result.current); } catch (mountError) { await store.rollback(); await render(result.before); throw new Error(`Patch mount failed and was rolled back: ${mountError.message}`); }
      status.textContent = `Patch ${result.current.version} ใช้งานแล้ว`; return result;
    } catch (error) { status.textContent = `Patch ถูกปฏิเสธ: ${error.message}`; return { status:'ERROR', error }; }
  };
  patchButton.addEventListener('click', runOneTap);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; if (!file) return; let attemptedVersion = null; status.textContent = 'กำลังตรวจ Patch…';
    try {
      const bundle = await parseSelectedPatchFile(file); attemptedVersion = bundle?.version ?? null; const trustedKey = await loadTrustedKey(fetchImpl); const { before, current } = await applyPatchBundle(bundle, { store, trustedKey });
      try { await render(current); } catch (mountError) { await store.rollback(); await render(before); throw new Error(`Patch mount failed and was rolled back: ${mountError.message}`); }
      status.textContent = `Patch ${current.version} ใช้งานแล้ว`;
    } catch (error) {
      if (attemptedVersion) { const meta = await store.readMeta().catch(() => null); if (meta?.currentVersion === attemptedVersion && meta.previousVersion) { await store.rollback().catch(() => undefined); await render(await store.readCurrent()).catch(() => undefined); } }
      status.textContent = `Patch ถูกปฏิเสธ: ${error.message}`;
    } finally { fileInput.value = ''; }
  });
  rollbackButton.addEventListener('click', async () => {
    status.textContent = 'กำลังย้อน Patch…';
    try { await store.rollback(); const current = await store.readCurrent(); await render(current); status.textContent = `ย้อนกลับเป็น ${current.version} แล้ว`; } catch (error) { status.textContent = `ย้อน Patch ไม่สำเร็จ: ${error.message}`; }
  });
  return { store, patchUpdater, getCurrent:() => store.readCurrent() };
}

if (typeof document !== 'undefined' && globalThis.__LIGHTHOUSE_TRUSTED_BOOTSTRAP__ !== true) {
  const launch = () => startPatchRuntime().catch(error => { const status = document.getElementById('patch-status'); if (status) status.textContent = `LIGHTHOUSE เริ่มไม่สำเร็จ: ${error.message}`; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch, { once:true }); else launch();
}
