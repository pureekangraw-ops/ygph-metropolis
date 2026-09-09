import {
  inspectGreenfieldDeviceUnlock,
  openGreenfieldRuntimeWithDevicePin,
  resetGreenfieldDevicePassword,
} from '../greenfield/runtime.mjs';
import { DEVICE_PIN_MIN_LENGTH } from '../greenfield/device-unlock.mjs';
import { activateRuntimeSession, deactivateRuntimeSession } from '../greenfield/runtime-session.mjs';

export function authMessage(error) {
  const code = String(error?.message || error || '');
  const copy = {
    DEVICE_PIN_INVALID: 'รหัสไม่ถูกต้อง',
    DEVICE_PIN_TOO_SHORT: `รหัสต้องมีอย่างน้อย ${DEVICE_PIN_MIN_LENGTH} ตัวอักษร`,
    DEVICE_PIN_CONFIRM_MISMATCH: 'รหัสใหม่ทั้งสองช่องไม่ตรงกัน',
    DEVICE_UNLOCK_NOT_ENROLLED: 'อุปกรณ์นี้ยังไม่ได้ตั้งค่ารหัสเข้าใช้งาน',
    DEVICE_UNLOCK_INCOMPLETE: 'ข้อมูลรหัสบนอุปกรณ์ยังไม่สมบูรณ์ ต้องซ่อมการตั้งค่าก่อน',
    GREENFIELD_VAULT_DECRYPT_FAILED: 'Recovery Code ไม่ถูกต้อง',
    LIGHTHOUSE_RUNTIME_STATE_REQUIRED: 'ยังอ่านข้อมูลจริงไม่ได้ จึงยังเข้าแอปไม่ได้',
  };
  return copy[code] || 'ดำเนินการไม่ได้ กรุณาลองใหม่';
}

export function createLighthouseRuntimeGate(deps = {}) {
  const inspectDeviceUnlock = deps.inspectDeviceUnlock ?? inspectGreenfieldDeviceUnlock;
  const openRuntimeWithPassword = deps.openRuntimeWithPassword ?? (input => openGreenfieldRuntimeWithDevicePin(input));
  const resetDevicePassword = deps.resetDevicePassword ?? (input => resetGreenfieldDevicePassword(input));
  const activateSession = deps.activateSession ?? activateRuntimeSession;
  const deactivateSession = deps.deactivateSession ?? deactivateRuntimeSession;
  const minPasswordLength = deps.minPasswordLength ?? DEVICE_PIN_MIN_LENGTH;
  let activeRuntime = null;

  async function inspect() {
    const result = await inspectDeviceUnlock();
    if (result?.status === 'ENROLLED') return { status: 'LOGIN' };
    if (result?.status === 'UNENROLLED' || result?.status === 'INCOMPLETE') {
      return { status: 'LOCKED_SETUP_REQUIRED', reason: result.status };
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

  return Object.freeze({ inspect, login, resetPassword, lock });
}
