import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { DEVICE_PIN_MIN_LENGTH } from '../greenfield/device-unlock.mjs';

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
  return 'ยังดำเนินการไม่ได้';
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
  installSettingsBackup(document);
  installSettingsPinChange(document);
}

export { backupFilename, installSettingsBackup, installSettingsPinChange, settingsError };
