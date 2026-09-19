const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const lifecycleUrl = pathToFileURL(path.resolve(
  __dirname,
  '../lighthouse-next/control-port/control-port-background-sync.mjs',
)).href;

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    emit(type) { listeners.get(type)?.(); },
  };
}

test('background lifecycle keeps the live route open and reconciles before sleep and after resume', async () => {
  const { installControlPortBackgroundSync } = await import(lifecycleUrl);
  const windowTarget = eventTarget();
  const documentTarget = { ...eventTarget(), visibilityState:'visible' };
  const calls = [];
  let appStateListener = null;
  const nativeApp = {
    async addListener(type, listener) {
      assert.equal(type, 'appStateChange');
      appStateListener = listener;
      return { remove() {} };
    },
  };

  await installControlPortBackgroundSync({
    windowTarget,
    documentTarget,
    nativeApp,
    ensureLive:options => { calls.push(['live', options]); },
    reconcile:options => { calls.push(['sync', options]); },
  });

  documentTarget.visibilityState = 'hidden';
  documentTarget.emit('visibilitychange');
  assert.deepEqual(calls, [['sync', { force:true }]], 'backgrounding must flush without closing the live route');

  calls.length = 0;
  await appStateListener({ isActive:false });
  assert.deepEqual(calls, [['sync', { force:true }]], 'native sleep must make one last reconcile attempt');

  calls.length = 0;
  await appStateListener({ isActive:true });
  assert.deepEqual(calls, [
    ['live', { force:true }],
    ['sync', { force:true }],
  ]);

  calls.length = 0;
  windowTarget.emit('online');
  assert.deepEqual(calls, [
    ['live', { force:true }],
    ['sync', { force:true }],
  ]);
});

test('background lifecycle never owns command confirmation', async () => {
  const { installControlPortBackgroundSync } = await import(lifecycleUrl);
  const windowTarget = eventTarget();
  const documentTarget = { ...eventTarget(), visibilityState:'hidden' };
  const runtime = {
    confirm() { throw new Error('AUTO_CONFIRM_FORBIDDEN'); },
  };

  await installControlPortBackgroundSync({
    windowTarget,
    documentTarget,
    runtime,
    ensureLive() {},
    reconcile() {},
  });

  documentTarget.emit('visibilitychange');
});

test('background lifecycle does not pull Hub work while LIGHTHOUSE is locked', async () => {
  const { installControlPortBackgroundSync } = await import(lifecycleUrl);
  const windowTarget = eventTarget();
  const documentTarget = { ...eventTarget(), visibilityState:'hidden' };
  let syncCalls = 0;

  await installControlPortBackgroundSync({
    windowTarget,
    documentTarget,
    canSync:() => false,
    ensureLive() {},
    reconcile() { syncCalls += 1; },
  });

  documentTarget.emit('visibilitychange');
  windowTarget.emit('online');
  assert.equal(syncCalls, 0);
});
