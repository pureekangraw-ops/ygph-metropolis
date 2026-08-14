import {
  openGreenfieldRuntime,
  openGreenfieldRuntimeWithDevicePin,
  verifyGreenfieldRecoveryCode,
  resetGreenfieldDevicePassword,
} from './greenfield/runtime.mjs';
import './ui/app.mjs';
void openGreenfieldRuntime;

const $ = id => document.getElementById(id);
let verifiedRecoveryCode = '';

function clearAuthStatus() {
  $('gateStatus').textContent = '';
  $('gateStatus').classList.remove('error');
}

function clearRecoverySecrets() {
  verifiedRecoveryCode = '';
  $('recoveryPassphrase').value = '';
  $('recoveryNewPassword').value = '';
  $('recoveryConfirmPassword').value = '';
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

function resetRecoverySteps() {
  $('recoveryVerifyStep').classList.remove('hidden');
  $('recoveryResetStep').classList.add('hidden');
}

function showLogin() {
  $('recoveryPanel').classList.add('hidden');
  $('gate').classList.remove('hidden');
  $('lockedAdvancedRecovery').open = false;
  clearRecoverySecrets();
  closeChangePasswordPanel();
  resetRecoverySteps();
  clearAuthStatus();
}

function showRecovery({ advanced = false } = {}) {
  clearRecoverySecrets();
  resetRecoverySteps();
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
  if (message === 'GREENFIELD_NOT_INITIALIZED') return 'ไม่พบข้อมูลเดิมในเครื่องนี้ หากต้องการกู้ข้อมูลให้เปิด “กู้คืนข้อมูลขั้นสูง”';
  if (message.startsWith('INVALID_GREENFIELD_')) return 'ไม่สามารถกู้คืนการเข้าถึงได้ กรุณาเปิด “กู้คืนข้อมูลขั้นสูง”';
  if (message === 'รหัสเข้าแอปต้องมีอย่างน้อย 6 ตัวอักษร') return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (message.startsWith('เครื่องนี้ยังไม่ได้ตั้งรหัสเข้าแอป')) return 'ยังไม่ได้ตั้งรหัสผ่านสำหรับเครื่องนี้ กรุณาเลือก “ลืมรหัสผ่าน?”';
  return message;
}

function showAuthError(error) {
  gateStatus.textContent = userFacingAuthMessage(String(error?.message || error || 'ไม่สามารถดำเนินการได้'));
  gateStatus.classList.add('error');
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
    clearRecoverySecrets();
    resetRecoverySteps();
  }
}).observe($('workspace'), { attributes:true, attributeFilter:['class'] });

$('forgotPasswordBtn').addEventListener('click', () => showRecovery());
$('recoveryBackBtn').addEventListener('click', () => showLogin());

$('verifyRecoveryBtn').addEventListener('click', async () => {
  clearAuthStatus();
  const recoveryCode = $('recoveryPassphrase').value;
  const button = $('verifyRecoveryBtn');
  button.disabled = true;
  try {
    await verifyGreenfieldRecoveryCode({ recoveryCode });
    verifiedRecoveryCode = recoveryCode;
    $('recoveryPassphrase').value = '';
    $('recoveryVerifyStep').classList.add('hidden');
    $('recoveryResetStep').classList.remove('hidden');
    gateStatus.textContent = 'รหัสกู้คืนถูกต้อง ตั้งรหัสผ่านใหม่ได้';
    $('recoveryNewPassword').focus();
  } catch (error) {
    verifiedRecoveryCode = '';
    showAuthError(error);
  } finally {
    button.disabled = false;
  }
});

$('resetPasswordBtn').addEventListener('click', async () => {
  clearAuthStatus();
  if (!verifiedRecoveryCode) {
    gateStatus.textContent = 'กรุณาตรวจสอบรหัสกู้คืนก่อน';
    gateStatus.classList.add('error');
    return;
  }
  const nextPassword = $('recoveryNewPassword').value;
  const confirmPassword = $('recoveryConfirmPassword').value;
  if (nextPassword.length < 6) {
    gateStatus.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    gateStatus.classList.add('error');
    return;
  }
  if (nextPassword !== confirmPassword) {
    gateStatus.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    gateStatus.classList.add('error');
    return;
  }
  const button = $('resetPasswordBtn');
  button.disabled = true;
  try {
    await resetGreenfieldDevicePassword({ recoveryCode:verifiedRecoveryCode, nextPassword });
    showLogin();
    gateStatus.textContent = 'ตั้งรหัสผ่านใหม่แล้ว';
  } catch (error) {
    showAuthError(error);
  } finally {
    button.disabled = false;
  }
});

$('changePasswordBtn').addEventListener('click', () => {
  $('appStatus').textContent = '';
  clearChangePasswordFields();
  $('changePasswordPanel').classList.remove('hidden');
  $('changeCurrentPassword').focus();
});

$('cancelChangePasswordBtn').addEventListener('click', () => {
  closeChangePasswordPanel();
  $('appStatus').textContent = '';
});

$('submitChangePasswordBtn').addEventListener('click', async () => {
  const currentPassword = $('changeCurrentPassword').value;
  const nextPassword = $('changeNewPassword').value;
  const confirmPassword = $('changeConfirmPassword').value;
  const status = $('settingsStatus');
  const button = $('submitChangePasswordBtn');
  status.textContent = '';
  status.classList.remove('error');

  if (nextPassword.length < 6) {
    status.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    status.classList.add('error');
    return;
  }
  if (nextPassword !== confirmPassword) {
    status.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    status.classList.add('error');
    return;
  }

  let runtime = null;
  button.disabled = true;
  try {
    runtime = await openGreenfieldRuntimeWithDevicePin({ pin:currentPassword });
    await runtime.changeDevicePassword({ nextPassword });
    closeChangePasswordPanel();
    $('settingsDialog').close();
    $('appStatus').textContent = 'เปลี่ยนรหัสผ่านแล้ว';
  } catch (error) {
    status.textContent = userFacingAuthMessage(String(error?.message || error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้'));
    status.classList.add('error');
  } finally {
    runtime?.close();
    button.disabled = false;
  }
});

$('openRestoreRouteBtn').addEventListener('click', () => {
  $('systemLockBtn').click();
  showRecovery({ advanced:true });
});

$('systemLockBtn').addEventListener('click', () => {
  closeChangePasswordPanel();
  showLogin();
});