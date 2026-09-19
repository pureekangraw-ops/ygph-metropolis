const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const gatePath = path.join(root, 'lighthouse-next/runtime-gate.mjs');
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const appPath = path.join(root, 'lighthouse-next/app.mjs');
const setupHtmlPath = path.join(root, 'lighthouse-next/setup.html');
const setupAppPath = path.join(root, 'lighthouse-next/setup.mjs');

async function loadGate() {
  assert.equal(fs.existsSync(gatePath), true, 'missing lighthouse-next/runtime-gate.mjs');
  return import(`${gatePath}?t=${Date.now()}-${Math.random()}`);
}

function gateDeps(overrides = {}) {
  return {
    inspectDeviceUnlock: async () => ({ status: 'ENROLLED' }),
    openRuntimeWithPassword: async () => { throw new Error('not used'); },
    initializeFirstRun: async () => ({ status: 'CREATED_VERIFIED' }),
    resetDevicePassword: async () => ({ status: 'RESET' }),
    activateSession: () => {},
    deactivateSession: () => true,
    routeToSetup: () => {},
    minPasswordLength: 6,
    ...overrides,
  };
}

test('login reads durable state before activating the shared Runtime Session', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  const calls = [];
  const runtime = {
    async readState() { calls.push('read'); return { revision: 41 }; },
    project() { return {}; },
    close() { calls.push('close'); },
  };
  const gate = createLighthouseRuntimeGate(gateDeps({
    openRuntimeWithPassword: async ({ pin }) => { calls.push(`open:${pin}`); return runtime; },
    activateSession: value => { assert.equal(value, runtime); calls.push('activate'); },
    deactivateSession: value => { assert.equal(value, runtime); calls.push('deactivate'); return true; },
  }));

  assert.equal(gate.isUnlocked(), false);
  assert.deepEqual(await gate.login('123456'), { status: 'UNLOCKED', state: { revision: 41 } });
  assert.equal(gate.isUnlocked(), true);
  assert.deepEqual(calls, ['open:123456', 'read', 'activate']);
  assert.equal(gate.lock(), true);
  assert.equal(gate.isUnlocked(), false);
  assert.deepEqual(calls, ['open:123456', 'read', 'activate', 'deactivate', 'close']);
});

test('null durable state fails closed and closes the opened runtime without session activation', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  const calls = [];
  const runtime = {
    async readState() { calls.push('read'); return null; },
    project() { return {}; },
    close() { calls.push('close'); },
  };
  const gate = createLighthouseRuntimeGate(gateDeps({
    openRuntimeWithPassword: async () => runtime,
    activateSession: () => calls.push('activate'),
  }));

  await assert.rejects(() => gate.login('123456'), /LIGHTHOUSE_RUNTIME_STATE_REQUIRED/);
  assert.deepEqual(calls, ['read', 'close']);
});

test('inspect routes UNENROLLED to the standalone first-run page while keeping INCOMPLETE fail-closed', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  for (const [raw, expected, routes] of [
    ['ENROLLED', { status: 'LOGIN' }, 0],
    ['UNENROLLED', { status: 'SETUP' }, 1],
    ['INCOMPLETE', { status: 'LOCKED_SETUP_REQUIRED', reason: 'INCOMPLETE' }, 0],
  ]) {
    let routeCount = 0;
    const gate = createLighthouseRuntimeGate(gateDeps({
      inspectDeviceUnlock: async () => ({ status: raw }),
      routeToSetup: () => { routeCount += 1; },
    }));
    assert.deepEqual(await gate.inspect(), expected);
    assert.equal(routeCount, routes);
  }
});

test('first-run setup validates confirmation and initializes durable credentials without opening a second session', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  const calls = [];
  const gate = createLighthouseRuntimeGate(gateDeps({
    initializeFirstRun: async input => {
      calls.push(`setup:${input.recoveryCode}:${input.password}`);
      return { status: 'CREATED_VERIFIED', state: { revision: 1 } };
    },
    openRuntimeWithPassword: async () => { calls.push('unexpected-open'); throw new Error('not used'); },
    activateSession: () => calls.push('unexpected-activate'),
  }));

  await assert.rejects(
    () => gate.setupFirstRun({ recoveryCode: 'recovery-code-123', password: '123456', confirmPassword: '654321' }),
    /DEVICE_PIN_CONFIRM_MISMATCH/,
  );
  assert.deepEqual(calls, []);

  assert.deepEqual(
    await gate.setupFirstRun({ recoveryCode: 'recovery-code-123', password: '123456', confirmPassword: '123456' }),
    { status: 'SETUP_COMPLETE', initialization: 'CREATED_VERIFIED' },
  );
  assert.deepEqual(calls, ['setup:recovery-code-123:123456']);
});

test('recovery validates password contract before calling the durable reset API', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  const writes = [];
  const gate = createLighthouseRuntimeGate(gateDeps({
    resetDevicePassword: async input => { writes.push(input); return { status: 'RESET' }; },
  }));

  await assert.rejects(
    () => gate.resetPassword({ recoveryCode: 'recovery', nextPassword: '12345', confirmPassword: '12345' }),
    /DEVICE_PIN_TOO_SHORT/,
  );
  await assert.rejects(
    () => gate.resetPassword({ recoveryCode: 'recovery', nextPassword: '123456', confirmPassword: '654321' }),
    /DEVICE_PIN_CONFIRM_MISMATCH/,
  );
  assert.equal(writes.length, 0);

  assert.deepEqual(
    await gate.resetPassword({ recoveryCode: 'recovery', nextPassword: '123456', confirmPassword: '123456' }),
    { status: 'RESET' },
  );
  assert.deepEqual(writes, [{ recoveryCode: 'recovery', nextPassword: '123456' }]);
});

test('runtime gate never persists passwords, recovery codes, or vault secrets in browser storage', () => {
  const source = fs.readFileSync(gatePath, 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|\.setItem\s*\(/);
  assert.doesNotMatch(source, /vaultPassphrase\s*=|recoveryCode\s*=\s*deps\.|password\s*=\s*deps\./);
});

test('LIGHTHOUSE gate exposes real password login and removes the four-digit demo keypad', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="auth-screen"/);
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="device-password"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /id="show-recovery"/);
  assert.doesNotMatch(html, /PIN 4 หลัก|data-pin=|pin-dots|pin-pad/);
});

test('standalone first-run page collects Recovery Code and password confirmation without file restore UI', () => {
  assert.equal(fs.existsSync(setupHtmlPath), true, 'missing lighthouse-next/setup.html');
  const html = fs.readFileSync(setupHtmlPath, 'utf8');
  assert.match(html, /id="setup-form"/);
  assert.match(html, /id="setup-password"/);
  assert.match(html, /id="setup-confirm-password"/);
  assert.match(html, /id="setup-recovery-code"/);
  assert.match(html, /\.\/setup\.mjs/);
  const setup = /id="setup-form"[\s\S]*?<\/form>/.exec(html)?.[0] || '';
  assert.doesNotMatch(setup, /type="file"|ไฟล์สำรอง/);
});

test('standalone first-run module delegates durable enrollment to runtime gate and clears secrets', () => {
  assert.equal(fs.existsSync(setupAppPath), true, 'missing lighthouse-next/setup.mjs');
  const source = fs.readFileSync(setupAppPath, 'utf8');
  assert.match(source, /createLighthouseRuntimeGate/);
  assert.match(source, /await runtimeGate\.setupFirstRun\(/);
  assert.match(source, /setupPasswordInput\.value\s*=\s*['"]["']/);
  assert.match(source, /setupConfirmPasswordInput\.value\s*=\s*['"]["']/);
  assert.match(source, /setupRecoveryCodeInput\.value\s*=\s*['"]["']/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|\.setItem\s*\(/);
});

test('LIGHTHOUSE recovery surface has Recovery Code, new password confirmation, and a route back to login', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="recovery-form"/);
  assert.match(html, /id="recovery-code"/);
  assert.match(html, /id="new-password"/);
  assert.match(html, /id="confirm-password"/);
  assert.match(html, /id="cancel-recovery"/);
  assert.match(html, /id="lock-app"/);
});

test('LIGHTHOUSE app delegates auth to runtime gate without persisting an unlocked demo session', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /from ['"]\.\/runtime-gate\.mjs['"]/);
  assert.match(app, /createLighthouseRuntimeGate/);
  assert.match(app, /authMessage/);
  assert.match(app, /runtimeGate\.inspect\(\)/);
  assert.match(app, /await runtimeGate\.login\(/);
  assert.match(app, /await runtimeGate\.resetPassword\(/);
  assert.match(app, /runtimeGate\.lock\(\)/);
  assert.doesNotMatch(app, /state\.sessionUnlocked|sessionUnlocked\s*:/);
  assert.doesNotMatch(app, /pinBuffer|pushPinDigit|popPinDigit|renderPinDots|unlockDemo/);
});

test('sensitive login and recovery fields are cleared after handling', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /devicePassword\.value\s*=\s*['"]["']/);
  assert.match(app, /recoveryCodeInput\.value\s*=\s*['"]["']/);
  assert.match(app, /newPasswordInput\.value\s*=\s*['"]["']/);
  assert.match(app, /confirmPasswordInput\.value\s*=\s*['"]["']/);
});
