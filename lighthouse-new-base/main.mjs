import { createBrowserApp } from './src/browser-app.mjs';
import { createBrowserModel } from './src/browser-model.mjs';
import { createMemoryDailyControls } from './src/daily-controls.mjs';
import { createRuntimeBoot } from './src/runtime-boot.mjs';
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

const bootState = await boot.inspect();
if (bootState.state === 'locked') {
  showLockedGate();
} else if (bootState.state === 'setup-required') {
  root.innerHTML = '<main class="runtime-gate"><h1>LIGHTHOUSE</h1><p>ต้องตั้งค่าการเข้าแอปก่อนใช้งาน</p></main>';
} else {
  root.innerHTML = '<main class="runtime-gate"><h1>LIGHTHOUSE</h1><p>ข้อมูลการเข้าแอปไม่สมบูรณ์ ต้องกู้คืนหรือซ่อมการตั้งค่าก่อน</p></main>';
}
