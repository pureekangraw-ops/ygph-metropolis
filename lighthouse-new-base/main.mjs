import { createBrowserApp } from './src/browser-app.mjs';
import { createBrowserModel } from './src/browser-model.mjs';
import { createMemoryDailyControls } from './src/daily-controls.mjs';
import { createRuntimeBoot } from './src/runtime-boot.mjs';
import { createAndroidUpdaterBridge } from './src/android-updater-bridge.mjs';
import { createUpdateController } from './src/update-controller.mjs';
import { createChatStore } from './src/chat-store.mjs';
import { createChatController } from './src/chat-controller.mjs';
import { createExpenseChatBridge } from './src/chat-expense-bridge.mjs';
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

const APP_VERSION = '2.0.1';
const APP_PACKAGE = 'com.yggdrasil.lighthouse';
const TEST_UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/pureekangraw-ops/ygph-metropolis/codex/lighthouse-new-base-20260902/update-test/manifest.json';

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
const updaterBridge = createAndroidUpdaterBridge();
const updater = createUpdateController({
  bridge:updaterBridge,
  manifestUrl:TEST_UPDATE_MANIFEST_URL,
  packageName:APP_PACKAGE,
});
const chatStore = createChatStore();
const chatController = createChatController({
  store:chatStore,
  interpret:text => withRuntimeSession(runtime => {
    const bridge = createExpenseChatBridge({ runtime });
    return bridge.interpret(text);
  }),
  commit:draft => withRuntimeSession(runtime => {
    const bridge = createExpenseChatBridge({ runtime });
    return bridge.commit(draft);
  }),
  readback:(result, draft) => withRuntimeSession(runtime => {
    const bridge = createExpenseChatBridge({ runtime });
    return bridge.readback(result, draft);
  }),
});
const today = bangkokParts();
let activeApp = null;

function nativeUpdaterAvailable() {
  return Boolean(globalThis?.Capacitor?.Plugins?.LighthouseUpdater);
}

async function readUpdaterStatus() {
  if (!nativeUpdaterAvailable()) return null;
  return updater.restore();
}

async function startProduct() {
  const projected = await browserModel.read(today);
  if (!projected.available) throw new Error('LIGHTHOUSE_RUNTIME_NOT_READY');
  const updaterStatus = await readUpdaterStatus();
  const app = createBrowserApp({
    root,
    chatController,
    model:{
      manual:projected.manual,
      income:projected.income,
      outcome:projected.outcome,
      calendar:projected.calendar,
      ledger:projected.ledger,
      settings:{
        version:APP_VERSION,
        rollbackSupported:false,
        updaterStatus,
        operations:nativeUpdaterAvailable() ? updater : {},
      },
    },
  });
  activeApp = app;
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

document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !activeApp || !nativeUpdaterAvailable()) return;
  activeApp.setUpdaterStatus(await updater.restore());
});

const bootState = await boot.inspect();
if (bootState.state === 'locked') {
  showLockedGate();
} else if (bootState.state === 'setup-required') {
  showFirstRunGate();
} else {
  root.innerHTML = '<main class="runtime-gate"><h1>LIGHTHOUSE</h1><p>ข้อมูลการเข้าแอปไม่สมบูรณ์ ต้องกู้คืนหรือซ่อมการตั้งค่าก่อน</p></main>';
}
