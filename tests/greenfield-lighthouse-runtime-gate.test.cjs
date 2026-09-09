const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const gatePath = path.join(root, 'lighthouse-next/runtime-gate.mjs');

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
