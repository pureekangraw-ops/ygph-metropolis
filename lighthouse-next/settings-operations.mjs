import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { DEVICE_PIN_MIN_LENGTH } from '../greenfield/device-unlock.mjs';
import { getNativeCapacitorApp } from './capacitor-app.mjs';

export async function loadSettingsBuildIdentity({ fetchImpl = globalThis.fetch, capacitor = globalThis.Capacitor } = {}) {
  const App = getNativeCapacitorApp(capacitor);
  if (App && typeof App.getInfo === 'function') {
    const info = await App.getInfo();
    const applicationId = String(info?.id || '').trim();
    const versionName = String(info?.version || '').trim();
    const versionCode = Number(info?.build);
    if (!applicationId || !versionName || !Number.isInteger(versionCode) || versionCode <= 0) {
      throw new Error('LIGHTHOUSE_BUILD_IDENTITY_INVALID');
    }
    return Object.freeze({
      owner:'ANDROID_INSTALLED_APP',
      applicationId,
      versionCode,
      versionName,
      baselineVersionCode:null,
    });
  }

  if (typeof fetchImpl !== 'function') throw new Error('LIGHTHOUSE_BUILD_IDENTITY_UNAVAILABLE');
  const response = await fetchImpl('./build-identity.json', { cache:'no-store' });
  if (!response?.ok) throw new Error('LIGHTHOUSE_BUILD_IDENTITY_UNAVAILABLE');
  const value = await response.json();
  if (value?.owner !== 'ANDROID_APK' || typeof value?.applicationId !== 'string' || !value.applicationId.trim() ||
      !Number.isInteger(Number(value?.versionCode)) || Number(value.versionCode) <= 0 ||
      typeof value?.versionName !== 'string' || !value.versionName.trim()) {
    throw new Error('LIGHTHOUSE_BUILD_IDENTITY_INVALID');
  }
  return Object.freeze({
    owner:'ANDROID_APK',
    applicationId:value.applicationId,
    versionCode:Number(value.versionCode),
    versionName:value.versionName,
    baselineVersionCode:Number.isInteger(Number(value.baselineVersionCode)) ? Number(value.baselineVersionCode) : null,
  });
}

export async function restoreSettingsBackup({
  backup,
  confirmRestore = async () => false,
  withSession = withRuntimeSession,
} = {}) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('LIGHTHOUSE_BACKUP_INVALID');
  if (typeof confirmRestore !== 'function') throw new TypeError('LIGHTHOUSE_RESTORE_CONFIRM_REQUIRED');
  if (await confirmRestore() !== true) return Object.freeze({ status:'CANCELLED' });
  return withSession(async runtime => {
    if (!runtime || typeof runtime.restoreBackup !== 'function' || typeof runtime.readState !== 'function') {
      throw new Error('LIGHTHOUSE_RESTORE_UNAVAILABLE');
    }
    const result = await runtime.restoreBackup(backup, { allowOverwrite:true });
    const state = await runtime.readState();
    if (!state || Number(state.revision) !== Number(result?.revision)) {
      return Object.freeze({
        status:'VERIFY',
        code:'LIGHTHOUSE_RESTORE_POSTCOMMIT_READBACK_MISMATCH',
        revision:Number(result?.revision),
        readbackRevision:Number.isFinite(Number(state?.revision)) ? Number(state.revision) : null,
        replacedExisting:Boolean(result?.replacedExisting),
      });
    }
    return Object.freeze({
      status:'VERIFIED',
      revision:Number(result.revision),
      replacedExisting:Boolean(result.replacedExisting),
    });
  });
}

async function readSettingsBackupFile(file) {
  if (!file || typeof file.text !== 'function') throw new Error('LIGHTHOUSE_BACKUP_FILE_REQUIRED');
  let backup;
  try { backup = JSON.parse(await file.text()); }
  catch { throw new Error('LIGHTHOUSE_BACKUP_INVALID'); }
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('LIGHTHOUSE_BACKUP_INVALID');
  return backup;
}

function backupFilename(now = new Date()) {
  const stamp = now.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return `lighthouse-backup-${stamp}.json`;
}

export async function createSettingsBackup({ withSession = withRuntimeSession } = {}) {
  return withSession(async runtime => {
    if (!runtime || typeof runtime.exportBackup !== 'function') throw new Error('LIGHTHOUSE_BACKUP_UNAVAILABLE');
    return runtime.exportBackup();
  });
}

export function downloadSettingsBackup(backup, { documentRef = globalThis.document, urlApi = globalThis.URL, now = new Date() } = {}) {
  if (!backup || typeof backup !== 'object') throw new Error('LIGHTHOUSE_BACKUP_INVALID');
  if (!documentRef?.createElement || !globalThis.Blob || !urlApi?.createObjectURL) throw new Error('LIGHTHOUSE_BACKUP_DOWNLOAD_UNAVAILABLE');
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type:'application/json;charset=utf-8' });
  const url = urlApi.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = backupFilename(now);
    anchor.rel = 'noopener';
    anchor.click();
    return anchor.download;
  } finally {
    urlApi.revokeObjectURL?.(url);
  }
}

export async function changeSettingsPin({ nextPin, confirmPin, withSession = withRuntimeSession } = {}) {
  const next = String(nextPin ?? '');
  if (next.length < DEVICE_PIN_MIN_LENGTH) throw new Error('DEVICE_PIN_TOO_SHORT');
  if (next !== String(confirmPin ?? '')) throw new Error('DEVICE_PIN_CONFIRM_MISMATCH');
  return withSession(async runtime => {
    if (!runtime || typeof runtime.changeDevicePassword !== 'function') throw new Error('LIGHTHOUSE_PIN_CHANGE_UNAVAILABLE');
    return runtime.changeDevicePassword({ nextPassword:next });
  });
}

function settingsError(error) {
  const code = String(error?.message || error || '');
  if (code === 'RUNTIME_SESSION_LOCKED') return 'แอปถูกล็อก กรุณาเข้าใหม่';
  if (code === 'DEVICE_PIN_TOO_SHORT') return `PIN ต้องมีอย่างน้อย ${DEVICE_PIN_MIN_LENGTH} ตัวอักษร`;
  if (code === 'DEVICE_PIN_CONFIRM_MISMATCH') return 'PIN ใหม่ทั้งสองช่องไม่ตรงกัน';
  if (code === 'LIGHTHOUSE_BUILD_IDENTITY_UNAVAILABLE' || code === 'LIGHTHOUSE_BUILD_IDENTITY_INVALID') return 'ยังอ่านเวอร์ชันจาก Android build ไม่ได้';
  if (code === 'LIGHTHOUSE_BACKUP_INVALID' || code.startsWith('INVALID_GREENFIELD_BACKUP') || code === 'GREENFIELD_BACKUP_DATABASE_IDENTITY_MISMATCH') return 'ไฟล์สำรองไม่ถูกต้องหรือไม่เข้ากับ LIGHTHOUSE';
  if (code === 'GREENFIELD_VAULT_DECRYPT_FAILED' || code === 'GREENFIELD_BACKUP_RECOVERY_KEY_MISSING') return 'ไฟล์สำรองเปิดไม่ได้ด้วย Recovery Code ของฐานนี้';
  if (code === 'GREENFIELD_BACKUP_READBACK_MISMATCH') return 'กู้คืนไม่ผ่าน readback และ Runtime คืนข้อมูลเดิมแล้ว';
  if (code === 'GREENFIELD_BACKUP_ROLLBACK_FAILED') return 'การคืนข้อมูลเดิมล้มเหลว · หยุดใช้งานและตรวจไฟล์สำรองก่อนทำต่อ';
  if (code === 'LIGHTHOUSE_RESTORE_POSTCOMMIT_READBACK_MISMATCH' || code === 'LIGHTHOUSE_RESTORE_READBACK_MISMATCH') return 'กู้คืนถูกเขียนแล้วแต่สถานะอ่านซ้ำยังไม่ชัด · ห้ามกู้ซ้ำจนกว่าจะตรวจสถานะ';
  return 'ยังดำเนินการไม่ได้';
}

function installSettingsVersion(root = globalThis.document) {
  const target = root?.querySelector?.('#settings-version');
  if (!target || target.dataset.bound === 'true') return false;
  target.dataset.bound = 'true';
  target.textContent = 'กำลังอ่านจาก Android build…';
  void loadSettingsBuildIdentity()
    .then(identity => {
      target.textContent = `${identity.versionName} · code ${identity.versionCode}`;
      target.dataset.versionCode = String(identity.versionCode);
      target.dataset.applicationId = identity.applicationId;
    })
    .catch(() => { target.textContent = 'ยังอ่านเวอร์ชันไม่ได้'; });
  return true;
}

function installSettingsRestore(root = globalThis.document) {
  const button = root?.querySelector?.('#restore-data');
  const input = root?.querySelector?.('#restore-file');
  if (!button || !input || button.dataset.bound === 'true') return false;
  button.dataset.bound = 'true';
  const status = root.querySelector?.('#settings-operations-status');

  button.addEventListener('click', () => {
    input.value = '';
    input.click();
  });

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    button.disabled = true;
    if (status) status.textContent = 'กำลังตรวจไฟล์สำรอง…';
    try {
      const backup = await readSettingsBackupFile(file);
      const result = await restoreSettingsBackup({
        backup,
        confirmRestore: async () => globalThis.confirm?.('กู้คืนจากข้อมูลสำรองนี้? ข้อมูลจริงปัจจุบันจะถูกแทนที่ และระบบจะตรวจ readback ก่อนยืนยัน') === true,
      });
      if (result.status === 'CANCELLED') {
        if (status) status.textContent = 'ยกเลิกการกู้คืนแล้ว';
        return;
      }
      if (result.status === 'VERIFY') {
        if (status) status.textContent = 'กู้คืนผ่าน durable verify แล้ว แต่ readback รอบสองไม่ตรง · ห้ามกู้ซ้ำ กรุณาปิดและเปิด LIGHTHOUSE เพื่อตรวจสถานะ';
        return;
      }
      if (status) status.textContent = `กู้คืนแล้ว · revision ${result.revision} · กำลังโหลดข้อมูลใหม่`;
      globalThis.location?.reload?.();
    } catch (error) {
      if (status) status.textContent = settingsError(error);
    } finally {
      button.disabled = false;
      input.value = '';
    }
  });
  return true;
}

function installSettingsBackup(root = globalThis.document) {
  const button = root?.querySelector?.('#backup-data');
  if (!button || button.dataset.bound === 'true') return false;
  button.dataset.bound = 'true';
  const status = root.querySelector?.('#settings-operations-status');
  button.addEventListener('click', async () => {
    button.disabled = true;
    if (status) status.textContent = 'กำลังสำรองข้อมูล…';
    try {
      const backup = await createSettingsBackup();
      const filename = downloadSettingsBackup(backup);
      if (status) status.textContent = `สำรองข้อมูลแล้ว · ${filename}`;
    } catch (error) {
      if (status) status.textContent = settingsError(error) === 'ยังดำเนินการไม่ได้' ? 'ยังสำรองข้อมูลไม่ได้' : settingsError(error);
    } finally {
      button.disabled = false;
    }
  });
  return true;
}

function installSettingsPinChange(root = globalThis.document) {
  const panel = root?.querySelector?.('#page-settings .settings-panel');
  if (!panel || panel.querySelector('[data-settings-pin-change]')) return false;
  const anchor = root.querySelector?.('#lock-app');
  const form = root.createElement('form');
  form.className = 'auth-form manual-direct-form';
  form.dataset.settingsPinChange = '';
  form.hidden = true;
  form.innerHTML = `<label>PIN ใหม่</label><input name="nextPin" type="password" minlength="${DEVICE_PIN_MIN_LENGTH}" autocomplete="new-password" required><label>ยืนยัน PIN ใหม่</label><input name="confirmPin" type="password" minlength="${DEVICE_PIN_MIN_LENGTH}" autocomplete="new-password" required><button class="primary-button" type="submit">บันทึก PIN ใหม่</button>`;

  const toggle = root.createElement('button');
  toggle.type = 'button';
  toggle.className = 'settings-button';
  toggle.dataset.settingsPinToggle = '';
  toggle.innerHTML = '<span><strong>เปลี่ยน PIN</strong><small>เปลี่ยนจาก session ที่เปิดอยู่ · ไม่ต้องใช้ Recovery Code</small></span><b>›</b>';
  const status = root.querySelector?.('#settings-operations-status');

  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input')?.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    if (status) status.textContent = 'กำลังเปลี่ยน PIN…';
    try {
      await changeSettingsPin({ nextPin:data.get('nextPin'), confirmPin:data.get('confirmPin') });
      form.reset();
      form.hidden = true;
      if (status) status.textContent = 'เปลี่ยน PIN แล้ว';
    } catch (error) {
      if (status) status.textContent = settingsError(error);
    } finally {
      submit.disabled = false;
    }
  });

  if (anchor) panel.insertBefore(toggle, anchor);
  else panel.append(toggle);
  panel.append(form);
  return true;
}

if (typeof document !== 'undefined') {
  installSettingsVersion(document);
  installSettingsBackup(document);
  installSettingsRestore(document);
  installSettingsPinChange(document);
}

export { backupFilename, installSettingsVersion, installSettingsBackup, installSettingsRestore, installSettingsPinChange, settingsError };
