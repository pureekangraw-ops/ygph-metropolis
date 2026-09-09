const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const gatePath = path.join(root, 'lighthouse-next/runtime-gate.mjs');
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const appPath = path.join(root, 'lighthouse-next/app.mjs');

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
  const runtime = {
    async readState() { calls.push('read'); return null; },
    project() { return {}; },
    close() { calls.push('close'); },
  };
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
      activateSession: () => {},
      deactivateSession: () => true,
      minPasswordLength: 6,
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
    activateSession: () => {},
    deactivateSession: () => true,
    minPasswordLength: 6,
  });

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

test('runtime gate never persists passwords, recovery codes, or vault secrets in browser storage', async () => {
  assert.equal(fs.existsSync(gatePath), true, 'missing lighthouse-next/runtime-gate.mjs');
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

test('LIGHTHOUSE recovery surface has Recovery Code, new password confirmation, and a route back to login', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="recovery-form"/);
  assert.match(html, /id="recovery-code"/);
  assert.match(html, /id="new-password"/);
  assert.match(html, /id="confirm-password"/);
  assert.match(html, /id="cancel-recovery"/);
  assert.match(html, /id="lock-app"/);
});

test('LIGHTHOUSE app delegates auth to runtime gate instead of persisting an unlocked demo session', () => {
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

test('sensitive auth fields are cleared after login, recovery, and cancellation handling', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /devicePassword\.value\s*=\s*['"]["']/);
  assert.match(app, /recoveryCodeInput\.value\s*=\s*['"]["']/);
  assert.match(app, /newPasswordInput\.value\s*=\s*['"]["']/);
  assert.match(app, /confirmPasswordInput\.value\s*=\s*['"]["']/);
});
