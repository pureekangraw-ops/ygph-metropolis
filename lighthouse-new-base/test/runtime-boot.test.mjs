import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeBoot } from '../src/runtime-boot.mjs';

test('runtime boot reports enrolled device as locked until owner unlocks it', async () => {
  const boot = createRuntimeBoot({
    inspectUnlock: async () => ({ status:'ENROLLED' }),
    openWithPin: async () => ({ readState(){} }),
    activateSession() {},
  });
  assert.deepEqual(await boot.inspect(), { state:'locked' });
});

test('runtime boot unlocks proven device PIN, activates the shared Runtime session, then reads back', async () => {
  const calls = [];
  const runtime = { async readState(){ calls.push('readState'); return { revision:7 }; } };
  const boot = createRuntimeBoot({
    inspectUnlock: async () => ({ status:'ENROLLED' }),
    openWithPin: async ({ pin }) => { calls.push(`open:${pin}`); return runtime; },
    activateSession(value) { calls.push('activate'); assert.equal(value, runtime); },
  });
  const result = await boot.unlock('123456');
  assert.deepEqual(calls, ['open:123456','activate','readState']);
  assert.deepEqual(result, { state:'ready', revision:7 });
});

test('runtime boot fails closed on unenrolled or incomplete device state', async () => {
  for (const status of ['UNENROLLED','INCOMPLETE']) {
    const boot = createRuntimeBoot({ inspectUnlock:async()=>({ status }), openWithPin:async()=>{ throw new Error('SHOULD_NOT_OPEN'); }, activateSession(){} });
    assert.deepEqual(await boot.inspect(), { state: status === 'UNENROLLED' ? 'setup-required' : 'repair-required' });
    await assert.rejects(boot.unlock('123456'), /RUNTIME_BOOT_NOT_READY/);
  }
});
