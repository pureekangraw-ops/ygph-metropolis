import { openGreenfieldRuntime } from './greenfield/runtime.mjs';
import './ui/app.mjs';
void openGreenfieldRuntime;

const $ = id => document.getElementById(id);

function clearAuthStatus() {
  $('gateStatus').textContent = '';
  $('gateStatus').classList.remove('error');
}

function showLogin() {
  $('recoveryPanel').classList.add('hidden');
  $('gate').classList.remove('hidden');
  $('lockedAdvancedRecovery').open = false;
  $('recoveryPassphrase').value = '';
  $('recoveryNewPassword').value = '';
  clearAuthStatus();
}

function showRecovery({ advanced = false } = {}) {
  $('gate').classList.add('hidden');
  $('recoveryPanel').classList.remove('hidden');
  $('lockedAdvancedRecovery').open = advanced;
  clearAuthStatus();
  if (advanced) $('restoreFile').focus();
  else $('recoveryPassphrase').focus();
}

function userFacingAuthMessage(message) {
  if (message === 'DEVICE_PIN_INVALID') return 'รหัสผ่านไม่ถูกต้อง';
  if (message === 'DEVICE_PIN_TOO_SHORT') return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (message === 'DEVICE_UNLOCK_INCOMPLETE') return 'ไม่สามารถเข้าสู่ระบบได้ กรุณาใช้ “ลืมรหัสผ่าน?”';
  if (message.startsWith('INVALID_DEVICE_UNLOCK_')) return 'ไม่สามารถเข้าสู่ระบบได้ กรุณาใช้ “ลืมรหัสผ่าน?”';
  if (message === 'GREENFIELD_VAULT_DECRYPT_FAILED') return 'รหัสกู้คืนไม่ถูกต้อง';
  if (message === 'PASSPHRASE_TOO_SHORT') return 'รหัสกู้คืนไม่ถูกต้อง';
  if (message.startsWith('INVALID_GREENFIELD_')) return 'ไม่สามารถกู้คืนการเข้าถึงได้ กรุณาเปิด “ตัวเลือกขั้นสูง”';
  if (message === 'GREENFIELD_NOT_INITIALIZED') return 'ยังไม่พบข้อมูลสำหรับกู้คืนการเข้าถึง';
  if (message === 'รหัสเข้าแอปต้องมีอย่างน้อย 6 ตัวอักษร') return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (message.startsWith('เครื่องนี้ยังไม่ได้ตั้งรหัสเข้าแอป')) return 'ยังไม่ได้ตั้งรหัสผ่านสำหรับเครื่องนี้ กรุณาเลือก “ลืมรหัสผ่าน?”';
  return message;
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
    $('recoveryPassphrase').value = '';
    $('recoveryNewPassword').value = '';
  }
}).observe($('workspace'), { attributes:true, attributeFilter:['class'] });

$('forgotPasswordBtn').addEventListener('click', () => showRecovery());
$('recoveryBackBtn').addEventListener('click', () => showLogin());

$('resetPasswordBtn').addEventListener('click', () => {
  const nextPassword = $('recoveryNewPassword').value;
  if (nextPassword.length < 6) {
    gateStatus.textContent = 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร';
    gateStatus.classList.add('error');
    return;
  }
  $('devicePin').value = nextPassword;
  $('enrollDeviceBtn').click();
});

$('changePasswordBtn').addEventListener('click', () => {
  $('systemLockBtn').click();
  showRecovery();
});

$('openRestoreRouteBtn').addEventListener('click', () => {
  $('systemLockBtn').click();
  showRecovery({ advanced:true });
});

$('systemLockBtn').addEventListener('click', () => showLogin());
