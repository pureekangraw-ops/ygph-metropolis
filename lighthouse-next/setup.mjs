import { createLighthouseRuntimeGate, authMessage } from './runtime-gate.mjs';

const setupForm = document.querySelector('#setup-form');
const setupPasswordInput = document.querySelector('#setup-password');
const setupConfirmPasswordInput = document.querySelector('#setup-confirm-password');
const setupRecoveryCodeInput = document.querySelector('#setup-recovery-code');
const setupSubmit = document.querySelector('#setup-submit');
const setupStatus = document.querySelector('#setup-status');
const runtimeGate = createLighthouseRuntimeGate();

function setBusy(busy) {
  setupPasswordInput.disabled = busy;
  setupConfirmPasswordInput.disabled = busy;
  setupRecoveryCodeInput.disabled = busy;
  setupSubmit.disabled = busy;
}

function setStatus(message, isError = false) {
  setupStatus.textContent = message;
  setupStatus.dataset.error = isError ? 'true' : 'false';
}

function clearSetupSecrets() {
  setupPasswordInput.value = '';
  setupConfirmPasswordInput.value = '';
  setupRecoveryCodeInput.value = '';
}

async function submitFirstRun(event) {
  event.preventDefault();
  setBusy(true);
  setStatus('กำลังสร้างกุญแจและตั้งค่า LIGHTHOUSE…');
  let completed = false;
  try {
    const result = await runtimeGate.setupFirstRun({
      recoveryCode: setupRecoveryCodeInput.value,
      password: setupPasswordInput.value,
      confirmPassword: setupConfirmPasswordInput.value,
    });
    if (result.status !== 'SETUP_COMPLETE') throw new Error('LIGHTHOUSE_SETUP_INCOMPLETE');
    completed = true;
    setStatus('ตั้งค่าเรียบร้อย กำลังกลับไปหน้าเข้าสู่ระบบ…');
  } catch (error) {
    setStatus(authMessage(error), true);
  } finally {
    clearSetupSecrets();
    setBusy(false);
  }
  if (completed) globalThis.location?.replace?.('./index.html');
}

setupForm.addEventListener('submit', submitFirstRun);
