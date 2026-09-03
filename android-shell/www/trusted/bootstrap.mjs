import { initializeFirstRun } from './source/greenfield/first-run.mjs';
import {
  inspectGreenfieldDeviceUnlock,
  openGreenfieldRuntimeWithDevicePin,
} from './source/greenfield/runtime.mjs';
import {
  activateRuntimeSession,
  deactivateRuntimeSession,
  withRuntimeSession,
} from './source/greenfield/runtime-session.mjs';
import { routeMasterInputText } from './source/lighthouse/master-input-route.mjs';
import {
  createRecoverySession,
  applySessionOwnerInput,
  rejoinRecoverySession,
} from './source/lighthouse/master-input-recovery-session.mjs';
import { createPathKernel } from './source/lighthouse/path-kernel.mjs';
import { createExpenseCapability } from './source/lighthouse/capabilities/expense.mjs';
import { createTrustedBrainAdapter } from './brain-adapter.mjs';
import { createTrustedBrainGate } from './brain-gate.mjs';
import { openTrustedErrorStatistics } from './error-statistics.mjs';

globalThis.__LIGHTHOUSE_TRUSTED_BOOTSTRAP__ = true;

function frozen(value) {
  return Object.freeze(value);
}

function idFactory(prefix) {
  let fallback = 0;
  return () => {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${++fallback}`;
  };
}

function errorText(error) {
  const message = String(error?.message || error || 'TRUSTED_BOOTSTRAP_FAILED');
  if (message === 'DEVICE_PIN_INVALID') return 'รหัสผ่านไม่ถูกต้อง';
  if (message === 'DEVICE_PIN_TOO_SHORT') return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (message === 'PASSPHRASE_TOO_SHORT') return 'รหัสกู้คืนต้องมีอย่างน้อย 12 ตัวอักษร';
  if (message === 'DEVICE_UNLOCK_INCOMPLETE') return 'ข้อมูลการปลดล็อกบนเครื่องไม่สมบูรณ์ ต้องกู้คืนข้อมูลก่อน';
  if (message === 'FIRST_RUN_ALREADY_ENROLLED') return 'เครื่องนี้ตั้งค่าการเข้าสู่ระบบแล้ว';
  return message;
}

function emptyErrorStatistics() {
  return { total:0, byCode:{}, events:[] };
}

function baht(amountSatang) {
  const amount = Number(amountSatang);
  if (!Number.isSafeInteger(amount)) return null;
  const value = amount / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function buildDurableRestoreNotice(state) {
  const records = Object.values(state?.domains?.LEDGER?.records ?? {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION' && record?.direction === 'OUT' && String(record?.detail ?? '').includes('EXPENSE'))
    .sort((left, right) => String(left?.createdAt ?? '').localeCompare(String(right?.createdAt ?? '')));
  const latest = records.at(-1);
  if (!latest) return null;
  const amount = baht(latest.amountSatang);
  if (amount == null) return null;
  const title = String(latest.title ?? 'รายการ').trim() || 'รายการ';
  return `กู้คืนข้อมูลแล้ว · ${title} ${amount} บาท`;
}

export function renderDurableRestoreNotice(documentRef, notice) {
  const message = String(notice ?? '').trim();
  if (!documentRef || !message) return false;
  const log = documentRef.querySelector?.('[data-chat-log]');
  if (!log) return false;
  const existing = log.querySelector?.('[data-durable-restore]');
  if (existing) {
    existing.textContent = message;
    return true;
  }
  const empty = log.querySelector?.('[data-empty-state]');
  if (empty) empty.hidden = true;
  const node = documentRef.createElement('div');
  node.className = 'message message-lighthouse';
  node.setAttribute('data-durable-restore', '');
  node.textContent = message;
  log.append(node);
  log.scrollTop = log.scrollHeight;
  return true;
}

export async function initializeTrustedFirstRun({
  recoveryCode,
  pin,
  indexedDBImpl = globalThis.indexedDB,
  now = () => new Date().toISOString(),
} = {}) {
  return initializeFirstRun({
    recoveryCode,
    password:pin,
    indexedDBImpl,
    now,
  });
}

export async function openTrustedBrain({
  pin,
  indexedDBImpl = globalThis.indexedDB,
  lockManager = globalThis.navigator?.locks ?? null,
  now = () => new Date().toISOString(),
  confirmImpl = null,
  confirmTextImpl = null,
  documentRef = globalThis.document,
} = {}) {
  const runtime = await openGreenfieldRuntimeWithDevicePin({
    pin,
    indexedDBImpl,
    lockManager,
    now,
  });
  let active = false;
  let errorStatistics = null;
  try {
    activateRuntimeSession(runtime);
    active = true;

    try {
      errorStatistics = await openTrustedErrorStatistics({ pin, indexedDBImpl });
    } catch (error) {
      globalThis.console?.error?.('TRUSTED_ERROR_STATISTICS_OPEN_FAILED', error);
    }

    const adapter = createTrustedBrainAdapter({
      routeMasterInputText,
      createRecoverySession,
      applySessionOwnerInput,
      rejoinRecoverySession,
      pathKernel:createPathKernel({ capabilities:[createExpenseCapability()] }),
      withRuntimeSession,
      requestIdFactory:idFactory('REQ-LH'),
      inputIdFactory:idFactory('INPUT-LH'),
      receivedAt:now,
      timeZone:'Asia/Bangkok',
    });
    const brain = createTrustedBrainGate({
      brain:adapter,
      confirmImpl,
      confirmTextImpl,
      documentRef,
      now,
      recordErrorEvent:errorStatistics ? event => errorStatistics.record(event) : null,
    });
    let closed = false;

    return frozen({
      runtime,
      brain,
      async readErrorStatistics() {
        if (!errorStatistics) return emptyErrorStatistics();
        return errorStatistics.read();
      },
      close() {
        if (closed) return;
        closed = true;
        errorStatistics?.close();
        errorStatistics = null;
        if (active) {
          deactivateRuntimeSession(runtime);
          active = false;
        }
        runtime.close();
      },
    });
  } catch (error) {
    errorStatistics?.close();
    if (active) deactivateRuntimeSession(runtime);
    runtime.close();
    throw error;
  }
}

function installAuthStyle(documentRef) {
  if (documentRef.getElementById('lighthouse-trusted-auth-style')) return;
  const style = documentRef.createElement('style');
  style.id = 'lighthouse-trusted-auth-style';
  style.textContent = `
    .lighthouse-trusted-auth{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:1rem;background:#f6f8fb;color:#10213d;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .lighthouse-trusted-auth-card{width:min(28rem,100%);padding:1.25rem;border:1px solid #e2e7ef;border-radius:1.25rem;background:#fff;box-shadow:0 18px 55px rgba(16,33,61,.12)}
    .lighthouse-trusted-auth h1{margin:.2rem 0 .45rem;font-size:1.2rem}.lighthouse-trusted-auth p{margin:.3rem 0 1rem;line-height:1.5;color:#647187}
    .lighthouse-trusted-auth label{display:grid;gap:.35rem;margin:.8rem 0;font-size:.86rem;font-weight:650}.lighthouse-trusted-auth input{min-height:2.8rem;border:1px solid #dfe5ee;border-radius:.8rem;padding:.65rem .8rem;font:inherit}
    .lighthouse-trusted-auth button{width:100%;min-height:2.8rem;border:0;border-radius:.8rem;background:#10213d;color:#fff;font:inherit;font-weight:750;cursor:pointer}.lighthouse-trusted-auth button:disabled{opacity:.55;cursor:wait}
    .lighthouse-trusted-auth-status{min-height:1.3rem;margin:.75rem 0 0!important;color:#a02d2d!important;font-size:.86rem}
  `;
  documentRef.head.append(style);
}

function authShell(documentRef, { title, copy, setup = false } = {}) {
  installAuthStyle(documentRef);
  const overlay = documentRef.createElement('section');
  overlay.className = 'lighthouse-trusted-auth';
  overlay.setAttribute('aria-label', 'LIGHTHOUSE trusted unlock');
  overlay.innerHTML = `
    <form class="lighthouse-trusted-auth-card" data-trusted-auth-form>
      <small>LIGHTHOUSE · Trusted Brain</small>
      <h1>${title}</h1>
      <p>${copy}</p>
      <label>รหัสผ่าน
        <input data-trusted-pin type="password" minlength="6" autocomplete="${setup ? 'new-password' : 'current-password'}" required>
      </label>
      ${setup ? '<label>รหัสกู้คืน<input data-trusted-recovery type="password" minlength="12" autocomplete="off" required></label>' : ''}
      <button type="submit">${setup ? 'เริ่มใช้งาน' : 'เข้าสู่ระบบ'}</button>
      <p class="lighthouse-trusted-auth-status" data-trusted-auth-status role="alert"></p>
    </form>`;
  documentRef.body.append(overlay);
  return overlay;
}

async function startTrustedPatchRuntime({ documentRef, indexedDBImpl, brain }) {
  const { startPatchRuntime } = await import('../patch/patch-runtime.mjs');
  return startPatchRuntime({
    documentRef,
    indexedDB:indexedDBImpl,
    trustedBrain:brain,
  });
}

export async function bootstrapTrustedApp({
  documentRef = globalThis.document,
  indexedDBImpl = globalThis.indexedDB,
  lockManager = globalThis.navigator?.locks ?? null,
  now = () => new Date().toISOString(),
  confirmImpl = null,
  confirmTextImpl = null,
} = {}) {
  if (!documentRef) throw new Error('TRUSTED_BOOTSTRAP_DOCUMENT_REQUIRED');

  const unlock = await inspectGreenfieldDeviceUnlock({ indexedDBImpl });
  if (unlock.status === 'INCOMPLETE') {
    const overlay = authShell(documentRef, {
      title:'ต้องกู้คืนข้อมูลก่อน',
      copy:'ข้อมูลการปลดล็อกบนเครื่องไม่สมบูรณ์ ระบบจะไม่เปิดสิทธิ์เขียนจนกว่าจะกู้คืนได้สำเร็จ',
    });
    overlay.querySelector('[data-trusted-pin]')?.remove();
    overlay.querySelector('button')?.remove();
    overlay.querySelector('[data-trusted-auth-status]').textContent = 'DEVICE_UNLOCK_INCOMPLETE';
    return frozen({ status:'BLOCKED', reason:'DEVICE_UNLOCK_INCOMPLETE', close() {} });
  }

  const setup = unlock.status === 'UNENROLLED';
  const overlay = authShell(documentRef, {
    setup,
    title:setup ? 'ตั้งค่าเริ่มต้น' : 'ปลดล็อก LIGHTHOUSE',
    copy:setup
      ? 'ใช้รหัสผ่านอย่างน้อย 6 ตัว และเก็บรหัสกู้คืนอย่างน้อย 12 ตัวไว้นอกเครื่องอย่างปลอดภัย'
      : 'ปลดล็อกข้อมูลบนเครื่องก่อน แล้วจึงเปิด Front Door และ Trusted Brain',
  });
  const form = overlay.querySelector('[data-trusted-auth-form]');
  const status = overlay.querySelector('[data-trusted-auth-status]');
  const pinInput = overlay.querySelector('[data-trusted-pin]');
  const recoveryInput = overlay.querySelector('[data-trusted-recovery]');
  pinInput?.focus();

  let trustedSession = null;
  let patchRuntime = null;
  let disposed = false;

  const close = () => {
    if (disposed) return;
    disposed = true;
    trustedSession?.close();
    trustedSession = null;
    overlay.remove();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (trustedSession || disposed) return;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = '';
    try {
      const pin = pinInput.value;
      if (setup) {
        await initializeTrustedFirstRun({
          recoveryCode:recoveryInput.value,
          pin,
          indexedDBImpl,
          now,
        });
      }
      trustedSession = await openTrustedBrain({
        pin,
        indexedDBImpl,
        lockManager,
        now,
        confirmImpl,
        confirmTextImpl,
        documentRef,
      });
      patchRuntime = await startTrustedPatchRuntime({
        documentRef,
        indexedDBImpl,
        brain:trustedSession.brain,
      });
      const restoreNotice = buildDurableRestoreNotice(await trustedSession.runtime.readState());
      renderDurableRestoreNotice(documentRef, restoreNotice);
      overlay.remove();
    } catch (error) {
      trustedSession?.close();
      trustedSession = null;
      status.textContent = errorText(error);
      submit.disabled = false;
    }
  });

  return frozen({
    status:setup ? 'SETUP_REQUIRED' : 'UNLOCK_REQUIRED',
    close,
    get patchRuntime() { return patchRuntime; },
  });
}

if (typeof document !== 'undefined') {
  bootstrapTrustedApp().then((session) => {
    globalThis.addEventListener?.('pagehide', () => session.close(), { once:true });
  }).catch((error) => {
    const status = document.getElementById('patch-status');
    if (status) status.textContent = `LIGHTHOUSE เริ่มไม่สำเร็จ: ${errorText(error)}`;
  });
}
