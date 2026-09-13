import { withRuntimeSession } from '../greenfield/runtime-session.mjs';

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
      const code = String(error?.message || error || '');
      if (status) status.textContent = code === 'RUNTIME_SESSION_LOCKED' ? 'แอปถูกล็อก กรุณาเข้าใหม่' : 'ยังสำรองข้อมูลไม่ได้';
    } finally {
      button.disabled = false;
    }
  });
  return true;
}

if (typeof document !== 'undefined') installSettingsBackup(document);

export { backupFilename, installSettingsBackup };
