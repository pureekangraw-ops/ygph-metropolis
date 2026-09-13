const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadModule() {
  const target = path.resolve(__dirname, '../lighthouse-next/update/local-patch-client.mjs');
  return import(pathToFileURL(target).href);
}

test('Local Patch Client exposes the eight required delegated operations', async () => {
  const calls = [];
  const delegate = (name, value) => async (...args) => {
    calls.push([name, args]);
    return value;
  };

  const { createLocalPatchClient } = await loadModule();
  const client = createLocalPatchClient({
    identify: delegate('identify', { appId: 'com.yggdrasil.lighthouse' }),
    currentVersion: delegate('currentVersion', { version: '1.0.0' }),
    verify: delegate('verify', { verified: true }),
    stage: delegate('stage', { stagedId: 'candidate-1' }),
    test: delegate('test', { passed: true }),
    activate: delegate('activate', { activated: true }),
    readback: delegate('readback', { version: '1.0.1' }),
    rollback: delegate('rollback', { rolledBack: true }),
  });

  assert.deepEqual(await client.identify(), { appId: 'com.yggdrasil.lighthouse' });
  assert.deepEqual(await client.currentVersion(), { version: '1.0.0' });
  assert.deepEqual(await client.verify('manifest', 'payload'), { verified: true });
  assert.deepEqual(await client.stage('payload'), { stagedId: 'candidate-1' });
  assert.deepEqual(await client.test('candidate-1'), { passed: true });
  assert.deepEqual(await client.activate('candidate-1'), { activated: true });
  assert.deepEqual(await client.readback(), { version: '1.0.1' });
  assert.deepEqual(await client.rollback('failure'), { rolledBack: true });

  assert.deepEqual(calls.map(([name]) => name), [
    'identify',
    'currentVersion',
    'verify',
    'stage',
    'test',
    'activate',
    'readback',
    'rollback',
  ]);
});

test('Local Patch Client fails construction when a required owner is missing', async () => {
  const { createLocalPatchClient } = await loadModule();
  assert.throws(() => createLocalPatchClient({}), /missing dependency/i);
});
