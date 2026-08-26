import {
  openGreenfieldRuntimeWithDevicePin,
  openGreenfieldRuntimeFromBackup,
  enrollGreenfieldDeviceUnlock,
} from '../greenfield/runtime.mjs';
import { verifyPortableGreenfieldBackup } from '../greenfield/backup.mjs';
import { prepareBackupForRestore } from '../greenfield/restore-compat.mjs';
import { parseObligationImportFile, verifyObligationImportReadback } from '../greenfield/obligation-import.mjs';
import { parseFinanceSeedFile, verifyFinanceSeedReadback } from '../greenfield/finance-seed-import.mjs';
import { detectMetroImport, previewMetroImport, METRO_IMPORT_KIND } from '../greenfield/import-router.mjs';

const unlockButton = document.getElementById('unlockBtn');
const devicePinInput = document.getElementById('devicePin');
const settingsStatus = document.getElementById('settingsStatus');
const backupButton = document.getElementById('backupBtn');
const restoreButton = document.getElementById('openRestoreRouteBtn');
let activeDevicePin = '';
let selectedDocument = null;
let selectedKind = null;

settingsStatus?.classList.add('compact-status');

unlockButton?.addEventListener('click', () => {
  activeDevicePin = String(devicePinInput?.value || '');
}, { capture:true });

function importErrorText(error) {
  const message = String(error?.message || error || '');
  if (message === 'UNSUPPORTED_METRO_IMPORT' || message === 'INVALID_METRO_IMPORT_JSON') return 'ไฟล์นี้ใช้กับ Metro ไม่ได้';
  if (message === 'NO_METRO_IMPORT_FILE') return 'เลือกไฟล์ก่อนนำเข้า';
  if (message === 'DEVICE_PIN_INVALID') return 'การยืนยันตัวตนไม่พร้อม กรุณาเข้าสู่ระบบใหม่';
  if (message === 'GREENFIELD_BACKUP_RECOVERY_KEY_MISSING') return 'ไฟล์สำรองรุ่นเก่านี้ต้องใช้รหัสกู้คืนเดิม';
  if (message.startsWith('INVALID_GREENFIELD_BACKUP') || message.includes('BACKUP_DATABASE') || message.includes('BACKUP_VAULT')) return 'ไฟล์สำรองนี้ใช้กับ Metro ไม่ได้';
  if (message.includes('BACKUP_READBACK_MISMATCH') || message.includes('BACKUP_ROLLBACK')) return 'กู้คืนแล้วแต่ตรวจข้อมูลหลังบันทึกไม่ผ่าน';
  if (message.startsWith('INVALID_FINANCE_SEED') || message === 'FINANCE_SEED_SCHEMA_MISMATCH' || message === 'FINANCE_SEED_RESTORE_BOUNDARY_REQUIRED' || message.startsWith('FINANCE_SEED_COMMAND_NOT_ALLOWED')) return 'ไฟล์นี้ใช้กับ Metro รุ่นนี้ไม่ได้';
  if (message.startsWith('FINANCE_SEED_READBACK_MISMATCH')) return 'บันทึกแล้วแต่ตรวจผลหลังนำเข้าไม่ผ่าน';
  if (message.includes('FINANCE_SEED_ALREADY_APPLIED') || message.includes('FINANCE_SEED_RECORD_ALREADY_EXISTS') || message.includes('DUPLICATE')) return 'รายการจากไฟล์นี้มีอยู่ในระบบแล้ว';
  if (message.startsWith('INVALID_OBLIGATION_IMPORT') || message === 'OBLIGATION_IMPORT_NOT_UI_UPLOADABLE') return 'ไฟล์นี้ใช้กับ Metro รุ่นนี้ไม่ได้';
  if (message.includes('OBLIGATION_IMPORT_TOTAL') || message.includes('INSTALLMENT')) return 'ยอดรวมกับยอดแบ่งงวดในไฟล์ไม่ตรงกัน';
  if (message.includes('ALREADY')) return 'รายการนี้มีอยู่ในระบบแล้ว';
  if (message === 'OBLIGATION_IMPORT_READBACK_MISMATCH') return 'บันทึกแล้วแต่ตรวจผลหลังนำเข้าไม่ผ่าน';
  return 'นำเข้าไฟล์ไม่สำเร็จ กรุณาตรวจสอบไฟล์';
}

function setStatus(text, { error = false } = {}) {
  if (!settingsStatus) return;
  settingsStatus.textContent = text;
  settingsStatus.classList.toggle('error', error);
}

async function readSelectedFile(input) {
  const file = input?.files?.[0];
  if (!file) throw new Error('NO_METRO_IMPORT_FILE');
  try { return JSON.parse(await file.text()); }
  catch { throw new Error('INVALID_METRO_IMPORT_JSON'); }
}

function validateForKind(documentPayload, kind) {
  if (kind === METRO_IMPORT_KIND.FINANCE_SEED) return parseFinanceSeedFile(documentPayload);
  if (kind === METRO_IMPORT_KIND.OBLIGATION) return parseObligationImportFile(documentPayload);
  if (kind === METRO_IMPORT_KIND.BACKUP) {
    try { return prepareBackupForRestore(documentPayload); }
    catch (error) {
      if (String(error?.message || '') === 'GREENFIELD_BACKUP_RECOVERY_KEY_MISSING') return null;
      throw error;
    }
  }
  throw new Error('UNSUPPORTED_METRO_IMPORT');
}

function installSettingsImportDoor() {
  if (!backupButton) return null;
  const dataSection = backupButton.closest('.settings-section');
  if (!dataSection) return null;
  const heading = dataSection.querySelector('h3');
  if (heading) heading.textContent = 'ข้อมูลของฉัน';
  backupButton.textContent = 'สำรองข้อมูล';
  restoreButton?.classList.add('hidden');
  restoreButton?.setAttribute('aria-hidden', 'true');
  if (restoreButton) restoreButton.tabIndex = -1;

  const securitySection = document.getElementById('changePasswordBtn')?.closest('.settings-section');
  if (securitySection && dataSection.parentElement === securitySection.parentElement) securitySection.before(dataSection);

  let input = document.getElementById('settingsImportFile');
  let button = document.getElementById('settingsImportBtn');
  let preview = document.getElementById('settingsImportPreview');
  const existingFileName = document.getElementById('settingsImportFileName');
  if (input && button && preview) return { input, button, preview, fileName:existingFileName };

  const row = document.createElement('div');
  row.className = 'settings-file-picker';

  input = document.createElement('input');
  input.id = 'settingsImportFile';
  input.className='settings-file-native hidden';
  input.type = 'file';
  input.accept = 'application/json,.json';

  const chooseButton = document.createElement('button');
  chooseButton.id = 'settingsChooseImportFileBtn';
  chooseButton.type = 'button';
  chooseButton.className = 'secondary';
  chooseButton.textContent = 'เลือกไฟล์';
  chooseButton.addEventListener('click', () => input.click());

  const fileName = document.createElement('span');
  fileName.id = 'settingsImportFileName';
  fileName.className = 'settings-file-name';
  fileName.textContent = 'ยังไม่ได้เลือกไฟล์';

  button = document.createElement('button');
  button.id = 'settingsImportBtn';
  button.type = 'button';
  button.className = 'primary-action';
  button.textContent = 'นำเข้าไฟล์';
  row.append(chooseButton, fileName, input);

  preview = document.createElement('p');
  preview.id = 'settingsImportPreview';
  preview.className = 'muted';
  preview.setAttribute('aria-live', 'polite');
  const actionRow = backupButton.parentElement;
  dataSection.insertBefore(row, actionRow);
  dataSection.insertBefore(preview, actionRow);
  actionRow.insertBefore(button, backupButton);
  return { input, button, preview, fileName };
}

async function prepareBackupDocument(documentPayload) {
  try { return prepareBackupForRestore(documentPayload); }
  catch (error) {
    if (String(error?.message || '') !== 'GREENFIELD_BACKUP_RECOVERY_KEY_MISSING') throw error;
    const recoveryCode = globalThis.prompt?.('ไฟล์สำรองรุ่นเก่า: ใส่รหัสกู้คืนเดิม') ?? '';
    return prepareBackupForRestore(documentPayload, recoveryCode);
  }
}

async function importBackup(documentPayload, pin, previewText) {
  const prepared = await prepareBackupDocument(documentPayload);
  await verifyPortableGreenfieldBackup({ backup:prepared.backup });
  const confirmed = globalThis.confirm?.(`${previewText}\n\nข้อมูลปัจจุบันจะถูกแทนที่ ต้องการดำเนินการต่อหรือไม่?`) ?? false;
  if (!confirmed) return { status:'CANCELLED' };
  const restoredRuntime = await openGreenfieldRuntimeFromBackup({ backup:prepared.backup, allowOverwrite:true });
  try {
    await restoredRuntime.readState();
  } finally {
    restoredRuntime.close();
  }
  await enrollGreenfieldDeviceUnlock({ vaultPassphrase:prepared.recoveryKey, pin });
  sessionStorage.setItem('metro-auto-unlock-pin', pin);
  return { status:'VERIFIED' };
}

const controls = installSettingsImportDoor();
if (controls) {
  const { input, button, preview, fileName } = controls;

  input.addEventListener('change', async () => {
    selectedDocument = null;
    selectedKind = null;
    preview.textContent = '';
    setStatus('');
    const file = input.files?.[0];
    if (file && fileName) fileName.textContent=file.name;
    else if (fileName) fileName.textContent='ยังไม่ได้เลือกไฟล์';
    try {
      const documentPayload = await readSelectedFile(input);
      const kind = detectMetroImport(documentPayload);
      validateForKind(documentPayload, kind);
      selectedDocument = documentPayload;
      selectedKind = kind;
      preview.textContent = previewMetroImport(documentPayload);
    } catch (error) {
      preview.textContent = '';
      setStatus(importErrorText(error), { error:true });
    }
  });

  button.addEventListener('click', async () => {
    let runtime = null;
    button.disabled = true;
    setStatus('');
    try {
      const documentPayload = selectedDocument || await readSelectedFile(input);
      const kind = selectedKind || detectMetroImport(documentPayload);
      const previewText = previewMetroImport(documentPayload);
      preview.textContent = previewText;
      const pin = activeDevicePin;
      if (pin.length < 6) throw new Error('DEVICE_PIN_INVALID');

      if (kind === METRO_IMPORT_KIND.BACKUP) {
        const result = await importBackup(documentPayload, pin, previewText);
        if (result.status === 'CANCELLED') { setStatus('ยกเลิกการนำเข้าแล้ว'); return; }
        setStatus('กู้คืนข้อมูลแล้ว และตรวจข้อมูลหลังบันทึกผ่าน');
        setTimeout(() => location.reload(), 300);
        return;
      }

      runtime = await openGreenfieldRuntimeWithDevicePin({ pin });
      if (kind === METRO_IMPORT_KIND.FINANCE_SEED) {
        const seed = parseFinanceSeedFile(documentPayload);
        const result = await runtime.importFinanceSeed(seed);
        const after = await runtime.readState();
        verifyFinanceSeedReadback(after, seed);
        setStatus(`เพิ่มข้อมูลแล้ว ${result.appliedCommands} รายการ และตรวจผลผ่าน`);
      } else if (kind === METRO_IMPORT_KIND.OBLIGATION) {
        const payload = parseObligationImportFile(documentPayload);
        const before = await runtime.readState();
        if (before?.domains?.LEDGER?.records?.[payload.obligationId]) throw new Error('OBLIGATION_ALREADY_EXISTS');
        for (const installment of payload.installments) {
          if (before?.domains?.CALENDAR?.records?.[installment.queueId]) throw new Error('OBLIGATION_IMPORT_QUEUE_ALREADY_EXISTS');
        }
        await runtime.obligation(payload);
        const after = await runtime.readState();
        verifyObligationImportReadback(after, payload);
        setStatus(`เพิ่มภาระ 1 รายการ และกำหนดชำระ ${payload.installments.length} รายการแล้ว ตรวจผลผ่าน`);
      } else {
        throw new Error('UNSUPPORTED_METRO_IMPORT');
      }
      setTimeout(() => location.reload(), 300);
    } catch (error) {
      setStatus(importErrorText(error), { error:true });
    } finally {
      runtime?.close();
      button.disabled = false;
    }
  });
}
