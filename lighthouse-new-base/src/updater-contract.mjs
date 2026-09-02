const REQUIRED_FIELDS = Object.freeze([
  'versionName',
  'versionCode',
  'packageName',
  'apkUrl',
  'sha256',
  'sizeBytes',
  'releaseNotes',
]);

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function immutableHttpsApkUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (/\/latest(?:\/|$)/i.test(url.pathname)) return false;
  if (!/\.apk(?:$|[?#])/i.test(url.href)) return false;
  if (url.hostname === 'raw.githubusercontent.com') {
    return /^\/[^/]+\/[^/]+\/[0-9a-f]{40}\//i.test(url.pathname);
  }
  if (url.hostname === 'github.com') {
    return /\/releases\/download\/[^/]+\/[^/]+\.apk$/i.test(url.pathname);
  }
  return true;
}

export function validateUpdateManifest(raw, { packageName } = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('UPDATE_MANIFEST_INVALID');
  for (const field of REQUIRED_FIELDS) {
    if (!(field in raw) || raw[field] === null || raw[field] === '') throw new Error('UPDATE_MANIFEST_INVALID');
  }
  if (typeof raw.versionName !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(raw.versionName)) throw new Error('UPDATE_MANIFEST_INVALID');
  if (!positiveInteger(raw.versionCode)) throw new Error('UPDATE_MANIFEST_INVALID');
  if (typeof raw.packageName !== 'string') throw new Error('UPDATE_MANIFEST_INVALID');
  if (packageName && raw.packageName !== packageName) throw new Error('UPDATE_PACKAGE_MISMATCH');
  if (!immutableHttpsApkUrl(raw.apkUrl)) {
    if (/\/latest(?:\/|$)/i.test(String(raw.apkUrl || ''))) throw new Error('UPDATE_APK_URL_NOT_IMMUTABLE');
    throw new Error('UPDATE_APK_URL_INVALID');
  }
  if (!/^[0-9a-f]{64}$/.test(String(raw.sha256))) throw new Error('UPDATE_SHA256_INVALID');
  if (!Number.isInteger(raw.sizeBytes) || raw.sizeBytes <= 0) throw new Error('UPDATE_MANIFEST_INVALID');
  if (typeof raw.releaseNotes !== 'string' || raw.releaseNotes.trim().length === 0) throw new Error('UPDATE_MANIFEST_INVALID');
  return Object.freeze({
    versionName:raw.versionName,
    versionCode:raw.versionCode,
    packageName:raw.packageName,
    apkUrl:raw.apkUrl,
    sha256:raw.sha256,
    sizeBytes:raw.sizeBytes,
    releaseNotes:raw.releaseNotes,
  });
}

export function compareUpdateVersion({ installedVersionCode, candidateVersionCode } = {}) {
  if (!positiveInteger(installedVersionCode) || !positiveInteger(candidateVersionCode)) throw new Error('UPDATE_VERSION_INVALID');
  if (candidateVersionCode > installedVersionCode) return 'upgrade';
  if (candidateVersionCode === installedVersionCode) return 'same';
  return 'downgrade';
}

export function projectDownloadProgress({ downloadedBytes = 0, totalBytes = null } = {}) {
  const downloaded = Number.isFinite(Number(downloadedBytes)) && Number(downloadedBytes) >= 0 ? Number(downloadedBytes) : 0;
  const total = Number.isFinite(Number(totalBytes)) && Number(totalBytes) > 0 ? Number(totalBytes) : null;
  if (total === null) {
    return Object.freeze({ indeterminate:true, percent:null, downloadedBytes:downloaded, totalBytes:null });
  }
  const percent = Math.max(0, Math.min(100, Math.floor((downloaded / total) * 100)));
  return Object.freeze({ indeterminate:false, percent, downloadedBytes:downloaded, totalBytes:total });
}
