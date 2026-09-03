import {
  validateUpdateManifest,
  compareUpdateVersion,
  projectDownloadProgress,
} from './updater-contract.mjs';

function freezeStatus(value) {
  return Object.freeze({ ...value });
}

function requireBridge(bridge) {
  if (!bridge || typeof bridge !== 'object') throw new Error('UPDATER_BRIDGE_REQUIRED');
  return bridge;
}

export function createUpdateController({ bridge, manifestUrl, packageName } = {}) {
  const native = requireBridge(bridge);
  if (typeof manifestUrl !== 'string' || !manifestUrl.startsWith('https://')) throw new Error('UPDATE_MANIFEST_URL_REQUIRED');
  if (typeof packageName !== 'string' || !packageName) throw new Error('UPDATE_PACKAGE_REQUIRED');

  let candidate = null;
  let installed = null;
  let status = freezeStatus({ state:'idle', canUpdate:false });

  async function readManifest() {
    if (typeof native.fetchManifest !== 'function') throw new Error('UPDATE_MANIFEST_FETCH_UNAVAILABLE');
    return validateUpdateManifest(await native.fetchManifest(manifestUrl), { packageName });
  }

  async function readInstalled() {
    if (typeof native.getInstalledIdentity !== 'function') throw new Error('UPDATE_IDENTITY_READ_UNAVAILABLE');
    const value = await native.getInstalledIdentity();
    if (value?.packageName !== packageName || !Number.isInteger(value?.versionCode)) throw new Error('UPDATE_INSTALLED_IDENTITY_INVALID');
    installed = Object.freeze({ ...value });
    return installed;
  }

  async function checkUpdate() {
    try {
      const [manifest, current] = await Promise.all([readManifest(), readInstalled()]);
      candidate = manifest;
      const relation = compareUpdateVersion({ installedVersionCode:current.versionCode, candidateVersionCode:manifest.versionCode });
      if (relation === 'upgrade') {
        status = freezeStatus({ state:'update-available', canUpdate:true, installed:current, candidate:manifest });
      } else if (relation === 'same') {
        status = freezeStatus({ state:'up-to-date', canUpdate:false, installed:current, candidate:manifest });
      } else {
        status = freezeStatus({ state:'rejected-downgrade', canUpdate:false, installed:current, candidate:manifest, message:'รุ่นที่พบเก่ากว่ารุ่นที่ติดตั้งอยู่ จึงไม่ติดตั้ง' });
      }
      return status;
    } catch (error) {
      status = freezeStatus({ state:'Failed', canUpdate:false, message:'ตรวจหาอัปเดตไม่สำเร็จ', reason:error?.message || 'unknown' });
      return status;
    }
  }

  async function startUpdate() {
    if (!candidate || !installed) throw new Error('UPDATE_CHECK_REQUIRED');
    if (compareUpdateVersion({ installedVersionCode:installed.versionCode, candidateVersionCode:candidate.versionCode }) !== 'upgrade') throw new Error('UPDATE_NOT_NEWER');
    try {
      const result = await native.enqueueDownload(candidate);
      status = freezeStatus({
        state:result?.state || 'Downloading',
        canUpdate:true,
        installed,
        candidate,
        progress:projectDownloadProgress(result || {}),
      });
      return status;
    } catch (error) {
      status = freezeStatus({ state:'Failed', canUpdate:true, installed, candidate, message:'เริ่มดาวน์โหลดอัปเดตไม่สำเร็จ', reason:error?.message || 'unknown' });
      return status;
    }
  }

  async function readStatus() {
    if (!candidate || typeof native.readDownloadState !== 'function') return status;
    try {
      const result = await native.readDownloadState();
      status = freezeStatus({
        ...status,
        state:result?.state || status.state,
        progress:projectDownloadProgress(result || {}),
        message:result?.message || status.message,
      });
      return status;
    } catch (error) {
      status = freezeStatus({ ...status, state:'Failed', message:'อ่านสถานะดาวน์โหลดไม่สำเร็จ', reason:error?.message || 'unknown' });
      return status;
    }
  }

  async function retry() {
    if (!candidate || typeof native.retryDownload !== 'function') throw new Error('UPDATE_RETRY_UNAVAILABLE');
    try {
      const result = await native.retryDownload(candidate);
      status = freezeStatus({ ...status, state:result?.state || 'Retrying', progress:projectDownloadProgress(result || {}) });
      return status;
    } catch (error) {
      status = freezeStatus({ ...status, state:'Failed', message:'ลองดาวน์โหลดใหม่ไม่สำเร็จ', reason:error?.message || 'unknown' });
      return status;
    }
  }

  async function verify() {
    if (!candidate || typeof native.verifyDownloadedApk !== 'function') throw new Error('UPDATE_VERIFY_UNAVAILABLE');
    status = freezeStatus({ ...status, state:'Verifying' });
    try {
      const result = await native.verifyDownloadedApk(candidate);
      if (result?.ok !== true) {
        status = freezeStatus({ ...status, state:'Failed', message:result?.message || 'ไฟล์อัปเดตตรวจสอบไม่ผ่าน', reason:result?.reason || 'verification-failed' });
        return status;
      }
      status = freezeStatus({ ...status, state:'Ready to install', message:null });
      return status;
    } catch (error) {
      status = freezeStatus({ ...status, state:'Failed', message:'ตรวจไฟล์อัปเดตไม่สำเร็จ', reason:error?.message || 'unknown' });
      return status;
    }
  }

  async function install() {
    if (!candidate) throw new Error('UPDATE_CHECK_REQUIRED');
    if (typeof native.canInstallPackages !== 'function' || typeof native.installDownloadedApk !== 'function') throw new Error('UPDATE_INSTALL_UNAVAILABLE');
    try {
      const permission = await native.canInstallPackages();
      if (permission?.allowed !== true) {
        if (typeof native.requestInstallPermission === 'function') await native.requestInstallPermission();
        status = freezeStatus({ ...status, state:'permission-required', message:'อนุญาตให้ LIGHTHOUSE ติดตั้งแอปจากแหล่งนี้ก่อน แล้วกลับมาทำต่อได้' });
        return status;
      }
      const result = await native.installDownloadedApk();
      status = freezeStatus({ ...status, state:result?.state || 'Installing', message:'Android กำลังรอการยืนยันติดตั้ง' });
      return status;
    } catch (error) {
      status = freezeStatus({ ...status, state:'Failed', message:'เปิดหน้าติดตั้งอัปเดตไม่สำเร็จ', reason:error?.message || 'unknown' });
      return status;
    }
  }

  async function reconcile() {
    if (typeof native.reconcileInstalledVersion !== 'function') throw new Error('UPDATE_READBACK_UNAVAILABLE');
    const current = await native.reconcileInstalledVersion();
    if (current?.candidate) candidate = validateUpdateManifest(current.candidate, { packageName });
    installed = Object.freeze({ ...current });
    if (candidate && current?.packageName === packageName && current?.versionCode === candidate.versionCode) {
      status = freezeStatus({ state:'updated-successfully', canUpdate:false, installed, candidate, message:'อัปเดตสำเร็จ' });
    } else if (candidate) {
      status = freezeStatus({ ...status, state:'install-not-completed', installed, candidate, message:'การติดตั้งยังไม่สำเร็จหรือถูกยกเลิก' });
    } else {
      status = freezeStatus({ ...status, installed });
    }
    return status;
  }

  async function restore() {
    try {
      const current = await readInstalled();
      if (typeof native.reconcileInstalledVersion === 'function') {
        const reconciled = await native.reconcileInstalledVersion();
        if (reconciled?.candidate) candidate = validateUpdateManifest(reconciled.candidate, { packageName });
        if (reconciled?.state === 'updated-successfully' && candidate && reconciled.versionCode === candidate.versionCode) {
          installed = Object.freeze({ ...reconciled });
          status = freezeStatus({ state:'updated-successfully', canUpdate:false, installed, candidate, message:'อัปเดตสำเร็จ' });
          return status;
        }
        if (reconciled?.state === 'install-not-completed' && candidate) {
          installed = Object.freeze({ ...reconciled });
          status = freezeStatus({ state:'install-not-completed', canUpdate:true, installed, candidate, message:'การติดตั้งยังไม่สำเร็จหรือถูกยกเลิก' });
          return status;
        }
      }
      if (typeof native.readDownloadState !== 'function') return status;
      const persisted = await native.readDownloadState();
      if (persisted?.candidate) candidate = validateUpdateManifest(persisted.candidate, { packageName });
      if (!candidate) {
        status = freezeStatus({ state:'idle', canUpdate:false, installed:current });
        return status;
      }
      if (current.versionCode === candidate.versionCode) {
        status = freezeStatus({ state:'updated-successfully', canUpdate:false, installed:current, candidate, message:'อัปเดตสำเร็จ' });
        return status;
      }
      status = freezeStatus({
        state:persisted?.state || 'Downloading',
        canUpdate:candidate.versionCode > current.versionCode,
        installed:current,
        candidate,
        progress:projectDownloadProgress(persisted || {}),
        message:persisted?.message || null,
      });
      return status;
    } catch (error) {
      status = freezeStatus({ state:'Failed', canUpdate:false, message:'กู้สถานะอัปเดตไม่สำเร็จ', reason:error?.message || 'unknown' });
      return status;
    }
  }

  async function cancel({ permanent = false } = {}) {
    if (typeof native.cancelUpdate === 'function') await native.cancelUpdate({ permanent });
    if (permanent) {
      candidate = null;
      status = freezeStatus({ state:'idle', canUpdate:false });
    }
    return status;
  }

  return Object.freeze({ checkUpdate, startUpdate, readStatus, retry, verify, install, reconcile, restore, cancel });
}
