import { createBrowserApp } from './src/browser-app.mjs';
import { createBrowserModel } from './src/browser-model.mjs';
import { createMemoryDailyControls } from './src/daily-controls.mjs';
import { createRuntimeBoot } from './src/runtime-boot.mjs';
import { initializeFirstRun } from '../greenfield/first-run.mjs';
import {
  inspectGreenfieldDeviceUnlock,
  openGreenfieldRuntimeWithDevicePin,
} from '../greenfield/runtime.mjs';
import {
  activateRuntimeSession,
  withRuntimeSession,
} from '../greenfield/runtime-session.mjs';

const root = document.getElementById('app');
if (!root) throw new Error('LIGHTHOUSE_APP_ROOT_MISSING');

function bangkokParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Bangkok',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date:`${values.year}-${values.month}-${values.day}`,
    year:Number(values.year),
    month:Number(values.month),
  };
}

const dailyControls = createMemoryDailyControls();
const browserModel = createBrowserModel({
  runtimeProvider: withRuntimeSession,
  dailyControls,
});
const boot = createRuntimeBoot({
  inspectUnlock:inspectGreenfieldDeviceUnlock,
  openWithPin:openGreenfieldRuntimeWithDevicePin,
  activateSession:activateRuntimeSession,
});
const today = bangkokParts();

async function startProduct() {
  const projected = await browserModel.read(today);
  if (!projected.available) throw new Error('LIGHTHOUSE_RUNTIME_NOT_READY');
  const app = createBrowserApp({
    root,
    model:{
      chat:{ messages:[] },
      manual:projected.manual,
      income:projected.income,
      outcome:projected.outcome,
      calendar:projected.calendar,
      ledger:projected.ledger,
      settings:{ version:'0.1.0-new-base', rollbackSupported:false },
    },
  });
  app.start();
}

function showLockedGate() {
  root.innerHTML = '<main class="runtime-gate"><h1>LIGHTHOUSE</h1><form data-runtime-unlock><label>รหัสเข้าแอป<input name="pin" type="password" inputmode="numeric" minlength="6" autocomplete="current-password" required></label><button type="submit">เข้าแอป</button><p data-runtime-message></p></form></main>';
  const form = root.querySelector('[data-runtime-unlock]');
  const message = root.querySelector('[data-runtime-message]');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const pin = new FormData(form).get('pin');
    try {
      await boot.unlock(String(pin || ''));
      await startProduct();
    } catch {
      if (message) message.textContent = 'รหัสไม่ถูกต้อง หรือยังเปิดข้อมูลไม่ได้';
    }
  });
}

function showFirstRunGate() {
  root.innerHTML = '<main class="runtime-gate"><h1>LIGHTHOUSE</h1><form data-first-run><label>ตั้งรหัสเข้าแอป<input name="password" type="password" inputmode="numeric" minlength="6" autocomplete="new-password" required></label><label>รหัสกู้คืน<input name="recoveryCode" type="password" minlength="12" autocomplete="new-password" required></label><button type="submit">เริ่มใช้งาน</button><p data-runtime-message></p></form></main>';
  const form = root.querySelector('[data-first-run]');
  const message = root.querySelector('[data-runtime-message]');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const recoveryCode = String(data.get('recoveryCode') || '');
    try {
      await initializeFirstRun({ recoveryCode, password });
      const state = await boot.inspect();
      if (state.state !== 'locked') throw new Error('LIGHTHOUSE_FIRST_RUN_READBACK_FAILED');
      await boot.unlock(password);
      await startProduct();
    } catch {
      if (message) message.textContent = 'ยังตั้งค่าไม่ได้ กรุณาตรวจรหัสเข้าแอปและรหัสกู้คืน';
    }
  });
}

const bootState = await boot.inspect();
if (bootState.state === 'locked') {
  showLockedGate();
} else if (bootState.state === 'setup-required') {
  showFirstRunGate();
} else {
  root.innerHTML = '<main class="runtime-gate"><h1>LIGHTHOUSE</h1><p>ข้อมูลการเข้าแอปไม่สมบูรณ์ ต้องกู้คืนหรือซ่อมการตั้งค่าก่อน</p></main>';
}
