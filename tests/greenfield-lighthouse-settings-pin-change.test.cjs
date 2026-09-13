const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const modulePath = path.join(root, 'lighthouse-next/settings-operations.mjs');

test('authenticated Settings PIN change uses the active Runtime and never asks for Recovery Code', async () => {
  const source = fs.readFileSync(modulePath, 'utf8');
  assert.match(source, /runtime\.changeDevicePassword\(/);
  assert.doesNotMatch(source, /recoveryCode/);

  const { changeSettingsPin } = await import(modulePath);
  let received = null;
  const result = await changeSettingsPin({
    nextPin:'abcdef',
    confirmPin:'abcdef',
    withSession: async operation => operation({
      changeDevicePassword: async input => { received = input; return { status:'RESET' }; },
    }),
  });

  assert.deepEqual(received, { nextPassword:'abcdef' });
  assert.deepEqual(result, { status:'RESET' });
});

test('Settings PIN change rejects mismatch before Runtime mutation', async () => {
  const { changeSettingsPin } = await import(modulePath);
  let calls = 0;
  await assert.rejects(
    changeSettingsPin({
      nextPin:'abcdef',
      confirmPin:'abcdeg',
      withSession: async operation => operation({
        changeDevicePassword: async () => { calls += 1; },
      }),
    }),
    /DEVICE_PIN_CONFIRM_MISMATCH/,
  );
  assert.equal(calls, 0);
});
