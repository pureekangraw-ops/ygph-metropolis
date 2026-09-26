import {
  inspectGreenfieldDeviceUnlock,
  openGreenfieldRuntimeWithDevicePin,
  resetGreenfieldDevicePassword,
} from '../greenfield/runtime.mjs';
import { initializeFirstRun } from '../greenfield/first-run.mjs';
import { DEVICE_PIN_MIN_LENGTH } from '../greenfield/device-unlock.mjs';
import { activateRuntimeSession, deactivateRuntimeSession } from '../greenfield/runtime-session.mjs';

export function authMessage(error) {
  const code = String(error?.message || error || '');
  const copy = {
    DEVICE_PIN_INVALID: 'PIN ไม่ถูกต้อง',
    DEVICE_PIN_TOO_SHORT: `PIN ต้องมีอย่างน้อย ${DEVICE_PIN_MIN_LENGTH} ตัวอักษร`,
    DEVICE_PIN_CONFIRM_MISMATCH: 'PIN ใหม่ทั้งสองช่องไม่ตรงกัน',
    RECOVERY_CODE_CONFIRM_MISMATCH: 'Recovery Code ทั้งสองช่องไม่ตรงกัน',
    DEVICE_UNLOCK_NOT_ENROLLED: 'อุปกรณ์นี้ยังไม่ได้ตั้งค่า PIN',
    DEVICE_UNLOCK_INCOMPLETE: 'ข้อมูล PIN บนอุปกรณ์ยังไม่สมบูรณ์ ต้องซ่อมการตั้งค่าก่อน',
    PASSPHRASE_TOO_SHORT: 'Recovery Code ต้องมีอย่างน้อย 12 ตัวอักษร',
    GREENFIELD_VAULT_DECRYPT_FAILED: 'Recovery Code ไม่ถูกต้อง',
    FIRST_RUN_ALREADY_ENROLLED: 'อุปกรณ์นี้ตั้งค่า PIN แล้ว กรุณาเข้าสู่ระบบ',
    LIGHTHOUSE_RUNTIME_STATE_REQUIRED: 'ยังอ่านข้อมูลจริงไม่ได้ จึงยังเข้าแอปไม่ได้',
  };
  return copy[code] || 'ดำเนินการไม่ได้ กรุณาลองใหม่';
}

function defaultSetupRoute() {
  globalThis.location?.replace?.('./setup.html');
}

export function createLighthouseRuntimeGate(deps = {}) {
  const inspectDeviceUnlock = deps.inspectDeviceUnlock ?? inspectGreenfieldDeviceUnlock;
  const openRuntimeWithPassword = deps.openRuntimeWithPassword ?? (input => openGreenfieldRuntimeWithDevicePin(input));
  const initialize = deps.initializeFirstRun ?? (input => initializeFirstRun(input));
  const resetDevicePassword = deps.resetDevicePassword ?? (input => resetGreenfieldDevicePassword(input));
  const activateSession = deps.activateSession ?? activateRuntimeSession;
  const deactivateSession = deps.deactivateSession ?? deactivateRuntimeSession;
  const routeToSetup = deps.routeToSetup ?? defaultSetupRoute;
  const minPasswordLength = deps.minPasswordLength ?? DEVICE_PIN_MIN_LENGTH;
  let activeRuntime = null;

  async function inspect() {
    const result = await inspectDeviceUnlock();
    if (result?.status === 'ENROLLED') return { status: 'LOGIN' };
    if (result?.status === 'UNENROLLED') {
      routeToSetup();
      return { status: 'SETUP' };
    }
    if (result?.status === 'INCOMPLETE') {
      return { status: 'LOCKED_SETUP_REQUIRED', reason: 'INCOMPLETE' };
    }
    throw new Error('DEVICE_UNLOCK_INCOMPLETE');
  }

  async function login(password) {
    const runtime = await openRuntimeWithPassword({ pin: String(password ?? '') });
    try {
      const state = await runtime.readState();
      if (!state) throw new Error('LIGHTHOUSE_RUNTIME_STATE_REQUIRED');
      activateSession(runtime);
      activeRuntime = runtime;
      return { status: 'UNLOCKED', state };
    } catch (error) {
      runtime.close?.();
      throw error;
    }
  }

  async function setupFirstRun({ recoveryCode, confirmRecoveryCode, password, confirmPassword } = {}) {
    const recovery = String(recoveryCode ?? '');
    const next = String(password ?? '');
    if (next.length < minPasswordLength) throw new Error('DEVICE_PIN_TOO_SHORT');
    if (next !== String(confirmPassword ?? '')) throw new Error('DEVICE_PIN_CONFIRM_MISMATCH');
    if (confirmRecoveryCode !== undefined && recovery !== String(confirmRecoveryCode ?? '')) {
      throw new Error('RECOVERY_CODE_CONFIRM_MISMATCH');
    }
    const result = await initialize({
      recoveryCode: recovery,
      password: next,
    });
    return {
      status: 'SETUP_COMPLETE',
      initialization: String(result?.status || 'UNKNOWN'),
    };
  }

  async function resetPassword({ recoveryCode, nextPassword, confirmPassword } = {}) {
    const next = String(nextPassword ?? '');
    if (next.length < minPasswordLength) throw new Error('DEVICE_PIN_TOO_SHORT');
    if (next !== String(confirmPassword ?? '')) throw new Error('DEVICE_PIN_CONFIRM_MISMATCH');
    await resetDevicePassword({ recoveryCode: String(recoveryCode ?? ''), nextPassword: next });
    return { status: 'RESET' };
  }

  function lock() {
    const runtime = activeRuntime;
    activeRuntime = null;
    if (!runtime) return false;
    deactivateSession(runtime);
    runtime.close?.();
    return true;
  }

  function isUnlocked() {
    return activeRuntime !== null;
  }

  return Object.freeze({ inspect, login, setupFirstRun, resetPassword, lock, isUnlocked });
}
