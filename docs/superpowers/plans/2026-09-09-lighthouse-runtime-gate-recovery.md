# LIGHTHOUSE Runtime Gate + Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake four-digit LIGHTHOUSE demo gate with the existing Greenfield device-password/runtime gate, add Recovery Code password reset, and package the exact browser runtime dependency closure for web staging and Android without changing business-data truth yet.

**Architecture:** Add one focused `lighthouse-next/runtime-gate.mjs` adapter over the existing Greenfield auth/runtime/session APIs. Keep the current LIGHTHOUSE UI and demo business state isolated, but make entry into the shell depend on successful durable Vault readback. Build one shared staging bundle shape (`lighthouse-next/` + the transitive `greenfield/` module closure) and use it for both isolated web staging and Android `www/`.

**Tech Stack:** Browser ES modules, Greenfield IndexedDB/Vault runtime, Web Crypto, Node.js 22 tests, Capacitor Android shell, Cloudflare Wrangler static assets.

**Spec:** `docs/superpowers/specs/2026-09-09-lighthouse-runtime-gate-recovery-design.md`

## Global Constraints

- Real device password minimum length is **6 characters**.
- Reuse `inspectGreenfieldDeviceUnlock`, `openGreenfieldRuntimeWithDevicePin`, `resetGreenfieldDevicePassword`, `activateRuntimeSession`, and `deactivateRuntimeSession`; do not create a second credential format.
- Login success requires `runtime.readState()` to return durable state **before** activating Runtime Session or showing the LIGHTHOUSE shell.
- `UNENROLLED` and `INCOMPLETE` fail closed as setup/repair-required states; no automatic Vault or credential creation.
- Never persist the submitted device password or Recovery Code in `localStorage`, `sessionStorage`, IndexedDB, or LIGHTHOUSE demo state.
- Successful recovery changes only the everyday device credential, returns to login, and does not auto-login.
- Invalid Recovery Code must remain zero-write behavior; existing `tests/greenfield-auth-recovery.test.cjs` stays green.
- Remaining `lighthouse-next` cash/products/transactions are still demo data during this phase and must remain visibly identifiable as demo/test behavior.
- Android app ID stays `com.yggdrasil.lighthouse`; signer/security/launcher identity are not changed in this phase.
- Do not publish a store release, change release manifest/update metadata, or claim Device Gate success from source tests.

## File Structure

- Create `lighthouse-next/runtime-gate.mjs` — the only LIGHTHOUSE auth/session adapter. It owns inspect/login/reset/lock lifecycle and user-safe auth error copy.
- Modify `lighthouse-next/index.html` — replace the numeric demo keypad with login and recovery forms; add an explicit lock control in Settings.
- Modify `lighthouse-next/app.mjs` — remove persisted fake auth state and wire DOM events to `runtime-gate.mjs`; demo business state remains untouched otherwise.
- Modify `lighthouse-next/styles.css` and, only where existing icon polish requires it, `lighthouse-next/owner-polish.css` — style login/recovery states without changing the four-root app navigation.
- Create `tests/greenfield-lighthouse-runtime-gate.test.cjs` — behavior/source contracts for auth ordering, fail-closed states, recovery validation, and credential non-persistence.
- Modify `tests/greenfield-lighthouse-next-demo.test.cjs` — retire assertions that require fake four-digit auth while preserving demo-business and UX contracts.
- Create `scripts/stage-lighthouse-next-bundle.mjs` — shared deterministic bundle builder for web staging and Android; copies approved LIGHTHOUSE files plus only the transitive Greenfield ES-module closure rooted at `runtime.mjs` and `runtime-session.mjs`.
- Modify `android-shell/tools/stage-lighthouse-next.mjs` — thin Android wrapper around the shared bundle builder.
- Modify `android-shell/test/lighthouse-next-package.test.mjs` — prove nested byte identity, module-closure completeness, fail-closed missing files, and forbidden-tree exclusion.
- Modify `wrangler.lighthouse-next-staging.jsonc`, `.github/workflows/greenfield-deploy-gate.yml`, `.gitignore`, and `package.json` — stage the composed web bundle before dry-run/deploy and include new source files in syntax gates.

---

### Task 1: Build the Runtime Gate Adapter

**Files:**
- Create: `lighthouse-next/runtime-gate.mjs`
- Create: `tests/greenfield-lighthouse-runtime-gate.test.cjs`

**Interfaces:**
- Consumes:
  - `inspectGreenfieldDeviceUnlock()`
  - `openGreenfieldRuntimeWithDevicePin({ pin })`
  - `resetGreenfieldDevicePassword({ recoveryCode, nextPassword })`
  - `DEVICE_PIN_MIN_LENGTH`
  - `activateRuntimeSession(runtime)` / `deactivateRuntimeSession(runtime)`
- Produces:
  - `createLighthouseRuntimeGate(deps?)`
  - gate methods `inspect()`, `login(password)`, `resetPassword({ recoveryCode, nextPassword, confirmPassword })`, `lock()`
  - `authMessage(error)` for safe Thai UI copy

- [ ] **Step 1: Write the failing adapter tests**

Create `tests/greenfield-lighthouse-runtime-gate.test.cjs` with dependency-injected fakes so ordering can be proven without touching real IndexedDB:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const gatePath = path.join(process.cwd(), 'lighthouse-next/runtime-gate.mjs');

async function loadGate() {
  assert.equal(fs.existsSync(gatePath), true, 'missing lighthouse-next/runtime-gate.mjs');
  return import(`${gatePath}?t=${Date.now()}-${Math.random()}`);
}

test('login reads durable state before activating the shared Runtime Session', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  const calls = [];
  const runtime = {
    async readState() { calls.push('read'); return { revision: 41 }; },
    project() { return {}; },
    close() { calls.push('close'); },
  };
  const gate = createLighthouseRuntimeGate({
    inspectDeviceUnlock: async () => ({ status: 'ENROLLED' }),
    openRuntimeWithPassword: async ({ pin }) => { calls.push(`open:${pin}`); return runtime; },
    resetDevicePassword: async () => ({ status: 'RESET' }),
    activateSession: value => { assert.equal(value, runtime); calls.push('activate'); },
    deactivateSession: value => { assert.equal(value, runtime); calls.push('deactivate'); return true; },
    minPasswordLength: 6,
  });

  assert.deepEqual(await gate.login('123456'), { status: 'UNLOCKED', state: { revision: 41 } });
  assert.deepEqual(calls, ['open:123456', 'read', 'activate']);
  assert.equal(gate.lock(), true);
  assert.deepEqual(calls, ['open:123456', 'read', 'activate', 'deactivate', 'close']);
});

test('null durable state fails closed and closes the opened runtime without session activation', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  const calls = [];
  const runtime = { async readState() { calls.push('read'); return null; }, project() { return {}; }, close() { calls.push('close'); } };
  const gate = createLighthouseRuntimeGate({
    inspectDeviceUnlock: async () => ({ status: 'ENROLLED' }),
    openRuntimeWithPassword: async () => runtime,
    resetDevicePassword: async () => ({ status: 'RESET' }),
    activateSession: () => calls.push('activate'),
    deactivateSession: () => true,
    minPasswordLength: 6,
  });
  await assert.rejects(() => gate.login('123456'), /LIGHTHOUSE_RUNTIME_STATE_REQUIRED/);
  assert.deepEqual(calls, ['read', 'close']);
});

test('inspect maps only ENROLLED to LOGIN and fails closed for UNENROLLED or INCOMPLETE', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  for (const [raw, expected] of [
    ['ENROLLED', { status: 'LOGIN' }],
    ['UNENROLLED', { status: 'LOCKED_SETUP_REQUIRED', reason: 'UNENROLLED' }],
    ['INCOMPLETE', { status: 'LOCKED_SETUP_REQUIRED', reason: 'INCOMPLETE' }],
  ]) {
    const gate = createLighthouseRuntimeGate({
      inspectDeviceUnlock: async () => ({ status: raw }),
      openRuntimeWithPassword: async () => { throw new Error('not used'); },
      resetDevicePassword: async () => ({ status: 'RESET' }),
      activateSession: () => {}, deactivateSession: () => true, minPasswordLength: 6,
    });
    assert.deepEqual(await gate.inspect(), expected);
  }
});

test('recovery validates password contract before calling the durable reset API', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  const writes = [];
  const gate = createLighthouseRuntimeGate({
    inspectDeviceUnlock: async () => ({ status: 'ENROLLED' }),
    openRuntimeWithPassword: async () => { throw new Error('not used'); },
    resetDevicePassword: async input => { writes.push(input); return { status: 'RESET' }; },
    activateSession: () => {}, deactivateSession: () => true, minPasswordLength: 6,
  });
  await assert.rejects(() => gate.resetPassword({ recoveryCode: 'recovery', nextPassword: '12345', confirmPassword: '12345' }), /DEVICE_PIN_TOO_SHORT/);
  await assert.rejects(() => gate.resetPassword({ recoveryCode: 'recovery', nextPassword: '123456', confirmPassword: '654321' }), /DEVICE_PIN_CONFIRM_MISMATCH/);
  assert.equal(writes.length, 0);
  assert.deepEqual(await gate.resetPassword({ recoveryCode: 'recovery', nextPassword: '123456', confirmPassword: '123456' }), { status: 'RESET' });
  assert.deepEqual(writes, [{ recoveryCode: 'recovery', nextPassword: '123456' }]);
});
```

Also add a source contract asserting `runtime-gate.mjs` contains no `localStorage`, `sessionStorage`, `setItem`, or credential-copying state.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/greenfield-lighthouse-runtime-gate.test.cjs
```

Expected: FAIL because `lighthouse-next/runtime-gate.mjs` does not exist.

- [ ] **Step 3: Implement the minimal adapter**

Create `lighthouse-next/runtime-gate.mjs` with this public shape:

```js
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
```

- [ ] **Step 4: Run focused adapter and existing recovery tests**

Run:

```bash
node --test tests/greenfield-lighthouse-runtime-gate.test.cjs tests/greenfield-auth-recovery.test.cjs tests/greenfield-runtime-session-ai-bridge.test.cjs
```

Expected: PASS, including the existing zero-write invalid-Recovery-Code contract.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/runtime-gate.mjs tests/greenfield-lighthouse-runtime-gate.test.cjs
git commit -m "feat: add LIGHTHOUSE runtime auth gate"
```

---

### Task 2: Replace the Fake PIN Screen With Real Login

**Files:**
- Modify: `lighthouse-next/index.html`
- Modify: `lighthouse-next/app.mjs`
- Modify: `lighthouse-next/styles.css`
- Modify: `tests/greenfield-lighthouse-runtime-gate.test.cjs`
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`

**Interfaces:**
- Consumes: `createLighthouseRuntimeGate()` and `authMessage(error)` from Task 1.
- Produces: DOM gate states `CHECKING`, `LOGIN`, `BUSY`, `ERROR`, `LOCKED_SETUP_REQUIRED`; successful login calls existing `showApp()` only after gate `login()` resolves.

- [ ] **Step 1: Add RED source/DOM contracts for the real login surface**

Extend `tests/greenfield-lighthouse-runtime-gate.test.cjs` to assert:

```js
const html = fs.readFileSync(path.join(process.cwd(), 'lighthouse-next/index.html'), 'utf8');
const app = fs.readFileSync(path.join(process.cwd(), 'lighthouse-next/app.mjs'), 'utf8');

assert.match(html, /id="login-form"/);
assert.match(html, /id="device-password"/);
assert.match(html, /autocomplete="current-password"/);
assert.match(html, /id="show-recovery"/);
assert.doesNotMatch(html, /PIN 4 หลัก|data-pin=|pin-dots|pin-pad/);
assert.match(app, /createLighthouseRuntimeGate/);
assert.match(app, /runtimeGate\.inspect\(/);
assert.match(app, /runtimeGate\.login\(/);
assert.doesNotMatch(app, /pinBuffer|unlockDemo|pushPinDigit|popPinDigit/);
assert.doesNotMatch(app, /state\.sessionUnlocked|sessionUnlocked:\s*true/);
```

Update `tests/greenfield-lighthouse-next-demo.test.cjs` so it continues to require `lighthouse-next-demo-v1` only for demo business/chat state, but no longer expects authentication to persist in that state.

- [ ] **Step 2: Run the two focused tests and verify RED**

Run:

```bash
node --test tests/greenfield-lighthouse-runtime-gate.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
```

Expected: FAIL on the old keypad/fake-session source.

- [ ] **Step 3: Replace only the gate markup and wire login lifecycle**

In `lighthouse-next/index.html`, replace the keypad with a password form while keeping the existing LIGHTHOUSE icon/brand treatment:

```html
<section id="auth-screen" class="auth-screen" aria-labelledby="auth-title">
  <div class="pin-brand" aria-hidden="true">
    <img class="pin-app-icon" src="./assets/lighthouse-icon.svg" alt="">
  </div>
  <div class="pin-copy">
    <p class="eyebrow">LIGHTHOUSE</p>
    <h1 id="auth-title">ก้าวต่อไปของคุณ</h1>
    <p class="muted">ใส่รหัสเข้าแอป</p>
  </div>
  <form id="login-form" class="auth-form">
    <label for="device-password">รหัสเข้าแอป</label>
    <input id="device-password" type="password" minlength="6" autocomplete="current-password" required>
    <button id="login-submit" class="primary-button" type="submit">เข้า LIGHTHOUSE</button>
    <button id="show-recovery" class="text-button" type="button">ลืมรหัส</button>
  </form>
  <p id="auth-status" class="pin-status" aria-live="polite">กำลังตรวจสถานะอุปกรณ์…</p>
  <div id="setup-required" class="auth-warning" hidden>
    <strong>อุปกรณ์นี้ยังไม่พร้อมเข้า LIGHTHOUSE</strong>
    <p>ต้องตั้งค่าหรือซ่อมรหัสอุปกรณ์จากระบบหลักก่อน</p>
  </div>
</section>
```

In `lighthouse-next/app.mjs`:

- import `createLighthouseRuntimeGate` and `authMessage`;
- delete fake PIN buffer/keypad functions and listeners;
- remove `sessionUnlocked` from `DEFAULT_STATE`, `cloneDefaults()`, and `saveState()`;
- create one `const runtimeGate = createLighthouseRuntimeGate();`;
- boot with `await runtimeGate.inspect()` and show only `LOGIN` or `LOCKED_SETUP_REQUIRED`;
- on login submit: disable form, call `runtimeGate.login(password)`, clear the password field in `finally`, and call `showApp()` only on resolved `UNLOCKED`;
- wrong password leaves `app-shell` hidden and displays `authMessage(error)`;
- keep `resetDemoState()` limited to demo business/chat state; it must no longer act as authentication/logout.

Use CSS classes `.auth-screen`, `.auth-form`, `.auth-warning`, `.text-button` while preserving `.pin-app-icon` so owner-locked artwork tests stay valid.

- [ ] **Step 4: Run focused login/UI regressions**

Run:

```bash
node --test tests/greenfield-lighthouse-runtime-gate.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs tests/greenfield-lighthouse-chat-viewport.test.cjs tests/greenfield-lighthouse-mobile-containment.test.cjs tests/lighthouse-owner-polish.test.cjs
```

Expected: PASS; the Android keyboard/nav fix remains untouched.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/index.html lighthouse-next/app.mjs lighthouse-next/styles.css tests/greenfield-lighthouse-runtime-gate.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
git commit -m "feat: replace LIGHTHOUSE demo PIN with real login"
```

---

### Task 3: Add Recovery and Explicit Lock

**Files:**
- Modify: `lighthouse-next/index.html`
- Modify: `lighthouse-next/app.mjs`
- Modify: `lighthouse-next/styles.css`
- Modify: `tests/greenfield-lighthouse-runtime-gate.test.cjs`

**Interfaces:**
- Consumes: `runtimeGate.resetPassword(...)`, `runtimeGate.lock()`, `authMessage(error)`.
- Produces: `RECOVERY` form, successful-reset return to `LOGIN` without auto-login, Settings action `#lock-app`, and page teardown session cleanup.

- [ ] **Step 1: Add RED recovery/lock source contracts**

Add assertions for these exact controls and lifecycle calls:

```js
assert.match(html, /id="recovery-form"/);
assert.match(html, /id="recovery-code"/);
assert.match(html, /autocomplete="new-password"/);
assert.match(html, /id="recovery-confirm"/);
assert.match(html, /id="lock-app"/);
assert.match(app, /runtimeGate\.resetPassword\(/);
assert.match(app, /runtimeGate\.lock\(/);
assert.match(app, /pagehide/);
assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*(password|recovery)/i);
assert.doesNotMatch(app, /sessionStorage/);
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node --test tests/greenfield-lighthouse-runtime-gate.test.cjs
```

Expected: FAIL because recovery/lock controls are not wired yet.

- [ ] **Step 3: Implement recovery UI and lock lifecycle**

Add a hidden recovery form under the auth screen:

```html
<form id="recovery-form" class="auth-form" hidden>
  <label for="recovery-code">Recovery Code</label>
  <input id="recovery-code" type="password" autocomplete="off" required>
  <label for="recovery-password">รหัสใหม่</label>
  <input id="recovery-password" type="password" minlength="6" autocomplete="new-password" required>
  <label for="recovery-confirm">ยืนยันรหัสใหม่</label>
  <input id="recovery-confirm" type="password" minlength="6" autocomplete="new-password" required>
  <button class="primary-button" type="submit">ตั้งรหัสใหม่</button>
  <button id="cancel-recovery" class="text-button" type="button">กลับไปเข้าสู่ระบบ</button>
</form>
```

Add a Settings row/button:

```html
<button type="button" id="lock-app" class="settings-button">
  <span><strong>ล็อก LIGHTHOUSE</strong><small>ปิด Runtime Session แล้วกลับหน้ารหัส</small></span><b>›</b>
</button>
```

Wire behavior in `app.mjs`:

```js
function clearRecoveryFields() {
  recoveryCode.value = '';
  recoveryPassword.value = '';
  recoveryConfirm.value = '';
}

async function submitRecovery(event) {
  event.preventDefault();
  try {
    await runtimeGate.resetPassword({
      recoveryCode: recoveryCode.value,
      nextPassword: recoveryPassword.value,
      confirmPassword: recoveryConfirm.value,
    });
    clearRecoveryFields();
    showLoginGate('ตั้งรหัสใหม่แล้ว กรุณาเข้าสู่ระบบ');
  } catch (error) {
    clearRecoveryFields();
    showRecoveryGate(authMessage(error));
  }
}

function lockApp() {
  runtimeGate.lock();
  appShell.hidden = true;
  showLoginGate('LIGHTHOUSE ถูกล็อกแล้ว');
}
```

Also call `runtimeGate.lock()` on `pagehide`. Do not auto-login after reset.

- [ ] **Step 4: Run recovery, login, and demo-regression tests**

Run:

```bash
node --test tests/greenfield-lighthouse-runtime-gate.test.cjs tests/greenfield-auth-recovery.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/index.html lighthouse-next/app.mjs lighthouse-next/styles.css tests/greenfield-lighthouse-runtime-gate.test.cjs
git commit -m "feat: add LIGHTHOUSE recovery and lock flow"
```

---

### Task 4: Build One Safe Web/Android Runtime Bundle

**Files:**
- Create: `scripts/stage-lighthouse-next-bundle.mjs`
- Modify: `android-shell/tools/stage-lighthouse-next.mjs`
- Modify: `android-shell/test/lighthouse-next-package.test.mjs`
- Modify: `wrangler.lighthouse-next-staging.jsonc`
- Modify: `.github/workflows/greenfield-deploy-gate.yml`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: source trees `lighthouse-next/` and `greenfield/`.
- Produces: `stageLighthouseBundle({ repoRoot, destinationRoot })` and deterministic bundle shape:

```text
<destination>/
  index.html
  lighthouse-next/
    index.html
    app.mjs
    runtime-gate.mjs
    styles.css
    owner-polish.css
    send-control.mjs
    general-income.mjs
    store-sale.mjs
    bangkok-date.mjs
    manifest.webmanifest
    assets/...
  greenfield/
    runtime.mjs
    runtime-session.mjs
    ...only their transitive relative ES-module dependencies...
```

- [ ] **Step 1: Write RED package tests for nested byte identity and module completeness**

Update `android-shell/test/lighthouse-next-package.test.mjs` to assert:

```js
const stagedLighthouse = join(shellRoot, 'www', 'lighthouse-next');
assert.deepEqual(
  await readFile(join(stagedLighthouse, 'runtime-gate.mjs')),
  await readFile(join(repoRoot, 'lighthouse-next', 'runtime-gate.mjs')),
);
assert.deepEqual(
  await readFile(join(shellRoot, 'www', 'greenfield', 'runtime.mjs')),
  await readFile(join(repoRoot, 'greenfield', 'runtime.mjs')),
);
assert.deepEqual(
  await readFile(join(shellRoot, 'www', 'greenfield', 'runtime-session.mjs')),
  await readFile(join(repoRoot, 'greenfield', 'runtime-session.mjs')),
);
```

Add a helper in the test that scans every staged `greenfield/*.mjs` import/export specifier matching `./*.mjs` and asserts the referenced staged file exists. Assert these forbidden paths do not exist in the bundle:

```text
ui/
release/
worker/
greenfield/first-run.mjs
greenfield/import-router.mjs
greenfield/master-input-router.mjs
greenfield/obligation-import.mjs
```

Keep the existing missing-`lighthouse-next/index.html` fail-closed fixture.

- [ ] **Step 2: Run Android package test and verify RED**

Run:

```bash
cd android-shell && node --test test/lighthouse-next-package.test.mjs
```

Expected: FAIL because the current stager is flat and does not include `runtime-gate.mjs` or Greenfield modules.

- [ ] **Step 3: Implement the shared bundle builder**

Create `scripts/stage-lighthouse-next-bundle.mjs` with:

```js
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIGHTHOUSE_RUNTIME_FILES = Object.freeze([
  'index.html', 'styles.css', 'owner-polish.css', 'app.mjs', 'runtime-gate.mjs',
  'send-control.mjs', 'general-income.mjs', 'store-sale.mjs', 'bangkok-date.mjs',
  'manifest.webmanifest',
]);
export const GREENFIELD_ENTRYPOINTS = Object.freeze(['runtime.mjs', 'runtime-session.mjs']);
const REQUIRED_ASSETS = Object.freeze(['assets/lighthouse-icon.svg', 'assets/lighthouse-icon-maskable.svg']);
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+\.mjs)['"]/g;

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

export async function collectGreenfieldModuleClosure(greenfieldRoot, entrypoints = GREENFIELD_ENTRYPOINTS) {
  const pending = [...entrypoints];
  const seen = new Set();
  while (pending.length) {
    const relative = normalize(pending.pop()).replaceAll('\\', '/');
    if (isAbsolute(relative) || relative.startsWith('../')) throw new Error(`GREENFIELD_STAGE_PATH_INVALID:${relative}`);
    if (seen.has(relative)) continue;
    const source = join(greenfieldRoot, relative);
    if (!(await exists(source))) throw new Error(`GREENFIELD_STAGE_SOURCE_MISSING:${relative}`);
    seen.add(relative);
    const text = await readFile(source, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) {
      const child = normalize(join(dirname(relative), match[1])).replaceAll('\\', '/');
      if (child.startsWith('../')) throw new Error(`GREENFIELD_STAGE_IMPORT_ESCAPES_ROOT:${relative}:${match[1]}`);
      pending.push(child);
    }
  }
  return [...seen].sort();
}

const ROOT_ENTRY = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LIGHTHOUSE</title><meta http-equiv="refresh" content="0;url=./lighthouse-next/index.html"></head><body><p>LIGHTHOUSE</p><script>location.replace('./lighthouse-next/index.html');</script></body></html>`;

export async function stageLighthouseBundle({ repoRoot, destinationRoot }) {
  const lighthouseRoot = join(repoRoot, 'lighthouse-next');
  const greenfieldRoot = join(repoRoot, 'greenfield');
  for (const relative of [...LIGHTHOUSE_RUNTIME_FILES, ...REQUIRED_ASSETS]) {
    if (!(await exists(join(lighthouseRoot, relative)))) throw new Error(`LIGHTHOUSE_NEXT_SOURCE_MISSING:${relative}`);
  }
  const greenfieldFiles = await collectGreenfieldModuleClosure(greenfieldRoot);
  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(join(destinationRoot, 'lighthouse-next', 'assets'), { recursive: true });
  await mkdir(join(destinationRoot, 'greenfield'), { recursive: true });
  await writeFile(join(destinationRoot, 'index.html'), ROOT_ENTRY, 'utf8');
  for (const relative of LIGHTHOUSE_RUNTIME_FILES) {
    const target = join(destinationRoot, 'lighthouse-next', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(lighthouseRoot, relative), target, { force: true });
  }
  for (const relative of REQUIRED_ASSETS) {
    const target = join(destinationRoot, 'lighthouse-next', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(lighthouseRoot, relative), target, { force: true });
  }
  for (const relative of greenfieldFiles) {
    const target = join(destinationRoot, 'greenfield', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(greenfieldRoot, relative), target, { force: true });
  }
  return { lighthouseFiles: [...LIGHTHOUSE_RUNTIME_FILES, ...REQUIRED_ASSETS], greenfieldFiles };
}
```

Add CLI support at the bottom: resolve repo root from `scripts/..`, require one destination argument, call `stageLighthouseBundle`, and print one success line. No external dependency is needed.

Change `android-shell/tools/stage-lighthouse-next.mjs` into a thin wrapper that calls:

```js
await stageLighthouseBundle({ repoRoot, destinationRoot: join(shellRoot, 'www') });
```

Keep its direct CLI behavior for `npm run app:stage-next`.

- [ ] **Step 4: Make isolated web staging use the same bundle shape**

Change `wrangler.lighthouse-next-staging.jsonc` assets directory to:

```json
"directory": "./.lighthouse-next-staging"
```

Add `.lighthouse-next-staging/` to `.gitignore`.

In `.github/workflows/greenfield-deploy-gate.yml`:

1. before the staging Wrangler dry-run, run `node scripts/stage-lighthouse-next-bundle.mjs .lighthouse-next-staging`;
2. before the actual isolated LIGHTHOUSE staging deploy, run the same staging command;
3. update Android byte-identity paths from `android-shell/www/<file>` to `android-shell/www/lighthouse-next/<file>`;
4. include `runtime-gate.mjs` in that byte-identity list.

In `package.json`, extend `check:syntax` with:

```text
node --check lighthouse-next/runtime-gate.mjs
node --check scripts/stage-lighthouse-next-bundle.mjs
```

- [ ] **Step 5: Run bundle/package/config gates**

Run:

```bash
cd android-shell && npm test
cd ..
node scripts/stage-lighthouse-next-bundle.mjs .lighthouse-next-staging
node --check scripts/stage-lighthouse-next-bundle.mjs
node --check lighthouse-next/runtime-gate.mjs
npx --yes wrangler@4.126.0 deploy --dry-run --config wrangler.lighthouse-next-staging.jsonc
```

Expected: PASS. Inspect `.lighthouse-next-staging/` and confirm no `ui/`, `release/`, `worker/`, or legacy root `app.mjs` exists.

- [ ] **Step 6: Commit**

```bash
git add scripts/stage-lighthouse-next-bundle.mjs android-shell/tools/stage-lighthouse-next.mjs android-shell/test/lighthouse-next-package.test.mjs wrangler.lighthouse-next-staging.jsonc .github/workflows/greenfield-deploy-gate.yml .gitignore package.json
git commit -m "build: stage LIGHTHOUSE with Greenfield runtime closure"
```

---

### Task 5: Run the Full Source Gate and Prove Scope Containment

**Files:**
- Modify only if a regression exposes a requirement already in the approved spec.
- Do not modify: `RELEASE_MANIFEST.json`, `release/lighthouse-update.json`, `.github/workflows/lighthouse-owner-build.yml`, `android-shell/version.json` in this phase.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: source/test evidence that auth + recovery + packaging are internally consistent; does not produce an APK or Device Gate result.

- [ ] **Step 1: Run focused auth/recovery tests**

```bash
node --test tests/greenfield-lighthouse-runtime-gate.test.cjs tests/greenfield-auth-recovery.test.cjs tests/greenfield-device-unlock.test.cjs tests/greenfield-runtime-session-ai-bridge.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run LIGHTHOUSE visual/behavior regressions affected by the gate change**

```bash
node --test \
  tests/greenfield-lighthouse-next-demo.test.cjs \
  tests/greenfield-lighthouse-chat-viewport.test.cjs \
  tests/greenfield-lighthouse-mobile-containment.test.cjs \
  tests/greenfield-lighthouse-live-visual-adoption.test.cjs \
  tests/greenfield-lighthouse-figma-polish-sweep.test.cjs \
  tests/lighthouse-owner-polish.test.cjs
```

Expected: PASS.

- [ ] **Step 3: Run Android shell tests and stage payload**

```bash
cd android-shell
npm test
npm run app:stage-next
cd ..
```

Expected: PASS. `android-shell/www/index.html` is the local entry and `android-shell/www/lighthouse-next/runtime-gate.mjs` plus the required `android-shell/www/greenfield/*.mjs` closure exist.

- [ ] **Step 4: Run the repository deploy gate**

```bash
npm run deploy:gate
```

Expected: PASS for Greenfield tests, syntax, and UTF-8 verification.

- [ ] **Step 5: Verify forbidden release scope stayed untouched**

Run:

```bash
git diff --name-only main...HEAD
```

Expected changed paths are limited to the spec/plan plus auth UI/adapter/tests/staging files listed in this plan. The output must not include:

```text
RELEASE_MANIFEST.json
release/lighthouse-update.json
android-shell/version.json
.github/workflows/lighthouse-owner-build.yml
```

- [ ] **Step 6: Commit any test-only contract adjustment required by the approved spec**

If Step 1–5 required a source/test correction already described by this plan, commit only that correction with a focused message such as:

```bash
git commit -m "test: lock LIGHTHOUSE runtime gate contracts"
```

If no correction was needed, do not create an empty commit.

## Plan Self-Review

- Spec coverage: authentication ordering, fail-closed setup states, non-persistent credentials, Recovery Code reset, no auto-login, session close, Android packaging, isolated web staging, and no release claim each have a concrete task.
- Packaging consistency: the approved spec requires `../greenfield/...` imports to work in both web and Android. The current staging config roots assets directly at `lighthouse-next/`, so Task 4 explicitly composes a shared staging root before Wrangler deploy; this is required to make the approved relative-import contract actually work.
- Placeholder scan: no implementation step depends on unspecified error handling, unspecified tests, or unnamed functions.
- Type/name consistency: later tasks use only `createLighthouseRuntimeGate`, `authMessage`, `inspect`, `login`, `resetPassword`, `lock`, `stageLighthouseBundle`, and `collectGreenfieldModuleClosure` as defined above.
