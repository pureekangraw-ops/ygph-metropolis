import {
  openGreenfieldRuntime,
  openGreenfieldRuntimeWithDevicePin,
  openGreenfieldRuntimeFromBackup,
  inspectGreenfieldDeviceUnlock,
  enrollGreenfieldDeviceUnlock,
} from './greenfield/runtime.mjs';
import { initializeFirstRun } from './greenfield/first-run.mjs';
import './ui/app.mjs';
import './ui/action-popups.mjs';
import './ui/release-status.mjs';
void openGreenfieldRuntime;

const $ = id => document.getElementById(id);
let lastDevicePin = '';

function setTruthCopy() {
  const homeBalanceLabel = $('homeBalance')?.closest('article')?.querySelector('small');
  const financeBalanceLabel = $('financeBalance')?.closest('article')?.querySelector('small');
  if (homeBalanceLabel) homeBalanceLabel.textContent = 'เงินสดคงเหลือ';
  if (financeBalanceLabel) financeBalanceLabel.textContent = 'เงินสดคงเหลือ';
}
setTruthCopy();

function clearAuthStatus() {
  $('gateStatus').textContent = '';
  $('gateStatus').classList.remove('error');
}
function clearChangePasswordFields() {
  $('changeCurrentPassword').value = '';
  $('changeNewPassword').value = '';
  $('changeConfirmPassword').value = '';
}
function closeChangePasswordPanel() {
  $('changePasswordPanel').classList.add('hidden');
  clearChangePasswordFields();
}
function showLogin() {
  $('recoveryPanel').classList.add('hidden');
  $('gate').classList.remove('hidden');
  closeChangePasswordPanel();
  clearAuthStatus();
  $('devicePin')?.focus();
}
function firstRunErrorText(error) {
  const message = String(error?.message || error || '');
  if (message === 'DEVICE_PIN_TOO_SHORT') return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (message === 'PASSPHRASE_TOO_SHORT') return 'รหัสกู้คืนต้องมีอย่างน้อย 12 ตัวอักษร';
  if (message === 'GREENFIELD_VAULT_DECRYPT_FAILED') return 'รหัสกู้คืนไม่ตรงกับข้อมูลเดิมในเครื่อง';
  if (message === 'DEVICE_UNLOCK_INCOMPLETE') return 'ข้อมูลการเข้าสู่ระบบเดิมไม่สมบูรณ์ กรุณากู้คืนข้อมูล';
  if (message === 'FIRST_RUN_ALREADY_ENROLLED') return 'เครื่องนี้ตั้งค่าการเข้าสู่ระบบแล้ว';
  return 'ตั้งค่าเริ่มต้นไม่สำเร็จ';
}
function showFirstSetup() {
  $('gate').classList.add('hidden');
  const panel = $('recoveryPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <h1>ตั้งค่าเริ่มต้น</h1>
    <p class="muted">ตั้งสองอย่างนี้ก่อน แล้วเข้าใช้งานได้เลย</p>
    <label>รหัสผ่าน <input id="firstPassword" type="password" minlength="6" autocomplete="new-password"></label>
    <label>รหัสกู้คืน <input id="firstRecoveryCode" type="password" minlength="12" autocomplete="off"></label>
    <button id="createFirstSetupBtn" class="primary-action" type="button">เริ่มใช้งาน</button>
  `;
  clearAuthStatus();
  $('firstPassword').focus();
  $('createFirstSetupBtn').addEventListener('click', async () => {
    const button = $('createFirstSetupBtn');
    const password = $('firstPassword').value;
    const recoveryCode = $('firstRecoveryCode').value;
    clearAuthStatus();
    button.disabled = true;
    try {
      await initializeFirstRun({ recoveryCode, password });
      sessionStorage.setItem('metro-auto-unlock-pin', password);
      location.reload();
    } catch (error) {
      $('gateStatus').textContent = firstRunErrorText(error);
      $('gateStatus').classList.add('error');
      button.disabled = false;
    }
  });
}
function showRecovery() {
  $('gate').classList.add('hidden');
  const panel = $('recoveryPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <button id="recoveryBackBtn" class="secondary" type="button">กลับ</button>
    <h1>กู้คืนข้อมูล</h1>
    <p class="muted">เลือกไฟล์สำรอง ระบบจะตรวจสอบไฟล์ให้เองก่อนกู้คืน</p>
    <div class="file-row"><input id="restoreFile" type="file" accept="application/json,.json"><button id="directRestoreBtn" class="primary-action" type="button">กู้คืนข้อมูล</button></div>
    <input id="recoveryPassphrase" class="hidden" aria-hidden="true" tabindex="-1">
  `;
  clearAuthStatus();
  $('recoveryBackBtn').addEventListener('click', showLogin);
  $('directRestoreBtn').addEventListener('click', restoreSelectedBackup);
  $('restoreFile').focus();
}
function userFacingAuthMessage(message) {
  if (message === 'DEVICE_PIN_INVALID') return 'รหัสผ่านไม่ถูกต้อง';
  if (message === 'DEVICE_PIN_TOO_SHORT' || message === 'รหัสเข้าแอปต้องมีอย่างน้อย 6 ตัวอักษร') return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (message === 'DEVICE_UNLOCK_INCOMPLETE' || message.startsWith('INVALID_DEVICE_UNLOCK_')) return 'ไม่สามารถเข้าสู่ระบบได้ กรุณากู้คืนจากไฟล์สำรอง';
  if (message.startsWith('เครื่องนี้ยังไม่ได้ตั้งรหัสเข้าแอป')) return 'ยังไม่ได้ตั้งรหัสผ่านสำหรับเครื่องนี้';
  return message;
}
export function restoreErrorText(error) {
  const message = String(error?.message || error || '');
  if (message === 'GREENFIELD_BACKUP_RECOVERY_KEY_MISSING') return 'ไฟล์สำรองรุ่นเก่านี้ยังต้องใช้รหัสกู้คืน กรุณาสร้างไฟล์สำรองใหม่จาก METRO รุ่นล่าสุด';
  if (message === 'GREENFIELD_BACKUP_READBACK_MISMATCH' || message === 'GREENFIELD_BACKUP_ROLLBACK_FAILED') return 'กู้คืนไม่สำเร็จ ระบบหยุดก่อนใช้ข้อมูลที่ตรวจไม่ผ่าน';
  if (message === 'GREENFIELD_VAULT_DECRYPT_FAILED' || message === 'GREENFIELD_BACKUP_EMPTY') return 'ไฟล์สำรองเปิดไม่ได้หรือข้อมูลไม่สมบูรณ์';
  if (message.includes('JSON') || message.includes('Unexpected token')) return 'ไฟล์สำรองไม่ถูกต้อง';
  if (message.startsWith('INVALID_GREENFIELD_') || message.includes('BACKUP_DATABASE_IDENTITY_MISMATCH')) return 'ไฟล์นี้ไม่ใช่ไฟล์สำรองที่ METRO ใช้ได้';
  return 'กู้คืนข้อมูลไม่สำเร็จ กรุณาตรวจสอบไฟล์สำรอง';
}
function showAuthError(error) {
  const gateStatus = $('gateStatus');
  gateStatus.textContent = userFacingAuthMessage(String(error?.message || error || 'ไม่สามารถดำเนินการได้'));
  gateStatus.classList.add('error');
}

async function selectedBackup() {
  const file = $('restoreFile').files?.[0];
  if (!file) throw new Error('NO_BACKUP_FILE');
  try { return JSON.parse(await file.text()); }
  catch { throw new Error('INVALID_BACKUP_JSON'); }
}
async function performRestore(backup, allowOverwrite) {
  const restoredRuntime = await openGreenfieldRuntimeFromBackup({ backup, allowOverwrite });
  restoredRuntime.close();
  const pin = lastDevicePin || $('devicePin').value;
  if (pin.length >= 6 && String(backup?.recoveryKey || '').length >= 12) {
    await enrollGreenfieldDeviceUnlock({ vaultPassphrase:backup.recoveryKey, pin });
    sessionStorage.setItem('metro-auto-unlock-pin', pin);
  }
}
async function restoreSelectedBackup() {
  const button = $('directRestoreBtn');
  const gateStatus = $('gateStatus');
  clearAuthStatus();
  button.disabled = true;
  try {
    const backup = await selectedBackup();
    try {
      await performRestore(backup, false);
    } catch (error) {
      if (error?.message !== 'GREENFIELD_RESTORE_CONFIRM_REQUIRED') throw error;
      if (!confirm('มีข้อมูลอยู่ในเครื่องแล้ว\nกู้คืนไฟล์นี้แทนที่ข้อมูลปัจจุบันหรือไม่?')) return;
      await performRestore(backup, true);
    }
    gateStatus.textContent = 'กู้คืนข้อมูลแล้ว';
    location.reload();
  } catch (error) {
    gateStatus.textContent = error?.message === 'NO_BACKUP_FILE' ? 'เลือกไฟล์สำรองก่อน' : restoreErrorText(error);
    gateStatus.classList.add('error');
  } finally { button.disabled = false; }
}

const gateStatus = $('gateStatus');
new MutationObserver(() => {
  const current = gateStatus.textContent || '';
  const translated = userFacingAuthMessage(current);
  if (translated !== current) gateStatus.textContent = translated;
}).observe(gateStatus, { childList:true, characterData:true, subtree:true });
new MutationObserver(() => {
  if (!$('workspace').classList.contains('hidden')) {
    $('devicePin').value = '';
    $('recoveryPanel').classList.add('hidden');
  }
}).observe($('workspace'), { attributes:true, attributeFilter:['class'] });

$('unlockBtn').addEventListener('click', () => { lastDevicePin = $('devicePin').value; }, { capture:true });
$('forgotPasswordBtn').textContent = 'กู้คืนข้อมูล';
$('forgotPasswordBtn').addEventListener('click', showRecovery);

$('changePasswordBtn').addEventListener('click', () => {
  $('appStatus').textContent = '';
  clearChangePasswordFields();
  $('changePasswordPanel').classList.remove('hidden');
  $('changeCurrentPassword').focus();
});
$('cancelChangePasswordBtn').addEventListener('click', () => { closeChangePasswordPanel(); $('appStatus').textContent = ''; });
$('submitChangePasswordBtn').addEventListener('click', async () => {
  const currentPassword = $('changeCurrentPassword').value;
  const nextPassword = $('changeNewPassword').value;
  const confirmPassword = $('changeConfirmPassword').value;
  const status = $('settingsStatus');
  const button = $('submitChangePasswordBtn');
  status.textContent = '';
  status.classList.remove('error');
  if (nextPassword.length < 6) { status.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'; status.classList.add('error'); return; }
  if (nextPassword !== confirmPassword) { status.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'; status.classList.add('error'); return; }
  let runtime = null;
  button.disabled = true;
  try {
    runtime = await openGreenfieldRuntimeWithDevicePin({ pin:currentPassword });
    await runtime.changeDevicePassword({ nextPassword });
    lastDevicePin = nextPassword;
    closeChangePasswordPanel();
    $('settingsDialog').close();
    $('appStatus').textContent = 'เปลี่ยนรหัสผ่านแล้ว';
  } catch (error) {
    status.textContent = userFacingAuthMessage(String(error?.message || error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้'));
    status.classList.add('error');
  } finally { runtime?.close(); button.disabled = false; }
});
$('openRestoreRouteBtn').addEventListener('click', () => {
  if ($('settingsDialog').open) $('settingsDialog').close();
  $('workspace').classList.add('hidden');
  showRecovery();
});
$('systemLockBtn').addEventListener('click', () => { closeChangePasswordPanel(); showLogin(); });

async function bootstrapEntry() {
  try {
    const unlock = await inspectGreenfieldDeviceUnlock();
    if (unlock.status === 'UNENROLLED') { showFirstSetup(); return; }
    if (unlock.status === 'INCOMPLETE') { showRecovery(); showAuthError(new Error('DEVICE_UNLOCK_INCOMPLETE')); return; }
    showLogin();
  } catch (error) {
    showLogin();
    showAuthError(error);
  }
}

const autoPin = sessionStorage.getItem('metro-auto-unlock-pin');
if (autoPin) {
  sessionStorage.removeItem('metro-auto-unlock-pin');
  lastDevicePin = autoPin;
  $('devicePin').value = autoPin;
  queueMicrotask(() => $('unlockBtn').click());
} else {
  void bootstrapEntry();
}
