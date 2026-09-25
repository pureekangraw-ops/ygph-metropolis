const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const gatePath = path.join(root, 'lighthouse-next/runtime-gate.mjs');
const setupHtmlPath = path.join(root, 'lighthouse-next/setup.html');
const setupAppPath = path.join(root, 'lighthouse-next/setup.mjs');

async function loadGate() {
  return import(`${gatePath}?t=${Date.now()}-${Math.random()}`);
}

test('first-run setup requires a matching Recovery Code confirmation before initialization', async () => {
  const { createLighthouseRuntimeGate } = await loadGate();
  let initialized = 0;
  const gate = createLighthouseRuntimeGate({
    initializeFirstRun: async () => {
      initialized += 1;
      return { status: 'CREATED_VERIFIED' };
    },
  });

  await assert.rejects(
    () => gate.setupFirstRun({
      recoveryCode: 'recovery-code-123',
      confirmRecoveryCode: 'recovery-code-321',
      password: '123456',
      confirmPassword: '123456',
    }),
    /RECOVERY_CODE_CONFIRM_MISMATCH/,
  );
  assert.equal(initialized, 0);

  await gate.setupFirstRun({
    recoveryCode: 'recovery-code-123',
    confirmRecoveryCode: 'recovery-code-123',
    password: '123456',
    confirmPassword: '123456',
  });
  assert.equal(initialized, 1);
});

test('first-run UI exposes and clears the Recovery Code confirmation field', () => {
  const html = fs.readFileSync(setupHtmlPath, 'utf8');
  const app = fs.readFileSync(setupAppPath, 'utf8');
  assert.match(html, /id="setup-confirm-recovery-code"/);
  assert.match(html, /ยืนยัน Recovery Code/);
  assert.match(app, /setupConfirmRecoveryCodeInput/);
  assert.match(app, /confirmRecoveryCode:\s*setupConfirmRecoveryCodeInput\.value/);
  assert.match(app, /setupConfirmRecoveryCodeInput\.value\s*=\s*['"]["']/);
});
