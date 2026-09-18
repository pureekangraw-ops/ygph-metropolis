const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const modulePath = path.join(root, 'lighthouse-next', 'chat-lifecycle.mjs');
const appPath = path.join(root, 'lighthouse-next', 'app.mjs');

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem:key => data.has(key) ? data.get(key) : null,
    setItem:(key,value) => data.set(key, String(value)),
    removeItem:key => data.delete(key),
    dump:key => data.get(key) ?? null,
  };
}

async function loadModule() {
  assert.equal(fs.existsSync(modulePath), true, 'missing lighthouse-next/chat-lifecycle.mjs');
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

test('CHAT lifecycle persists one message record plus append-only events and derived current state', async () => {
  const { createChatLifecycle } = await loadModule();
  const storage = memoryStorage();
  let tick = 0;
  const lifecycle = createChatLifecycle({
    storage,
    now:() => `2026-09-18T00:00:0${tick++}.000Z`,
  });

  lifecycle.commitMessage({ id:'MSG-1', body:'ข้าว 65', role:'user' });
  lifecycle.transition('MSG-1', {
    executionState:'CONFIRMATION_REQUIRED',
    readbackState:'IDLE',
    requestId:'REQ-1',
    eventType:'DRAFT_READY',
  });
  lifecycle.transition('MSG-1', {
    executionState:'WAITING',
    readbackState:'PENDING',
    eventType:'EXECUTION_STARTED',
  });
  lifecycle.transition('MSG-1', {
    executionState:'SUCCESS',
    readbackState:'VERIFIED',
    result:{ recordId:'TX-1' },
    eventType:'READBACK_VERIFIED',
  });

  const current = lifecycle.getMessage('MSG-1');
  assert.equal(current.executionState, 'SUCCESS');
  assert.equal(current.readbackState, 'VERIFIED');
  assert.equal(current.requestId, 'REQ-1');
  assert.deepEqual(current.result, { recordId:'TX-1' });

  const events = lifecycle.getEvents('MSG-1');
  assert.deepEqual(events.map(event => event.type), [
    'MESSAGE_COMMITTED',
    'DRAFT_READY',
    'EXECUTION_STARTED',
    'READBACK_VERIFIED',
  ]);
  assert.equal(events.every(event => event.messageId === 'MSG-1'), true);

  const reloaded = createChatLifecycle({ storage });
  assert.equal(reloaded.getMessage('MSG-1').executionState, 'SUCCESS');
  assert.equal(reloaded.getEvents('MSG-1').length, 4);
});

test('retry updates the same message record and never creates a second message', async () => {
  const { createChatLifecycle } = await loadModule();
  const storage = memoryStorage();
  const lifecycle = createChatLifecycle({ storage });

  lifecycle.commitMessage({ id:'MSG-1', body:'ข้าว 65', role:'user' });
  lifecycle.transition('MSG-1', {
    executionState:'WAITING',
    readbackState:'ERROR',
    requestId:'REQ-STABLE',
    error:'READBACK_UNAVAILABLE',
    eventType:'READBACK_FAILED',
  });
  lifecycle.transition('MSG-1', {
    executionState:'WAITING',
    readbackState:'PENDING',
    requestId:'REQ-STABLE',
    error:null,
    eventType:'RETRY_STARTED',
  });
  lifecycle.transition('MSG-1', {
    executionState:'SUCCESS',
    readbackState:'VERIFIED',
    requestId:'REQ-STABLE',
    result:{ recordId:'TX-STABLE' },
    eventType:'READBACK_VERIFIED',
  });

  const snapshot = lifecycle.snapshot();
  assert.equal(Object.keys(snapshot.messages).length, 1);
  assert.equal(snapshot.messages['MSG-1'].requestId, 'REQ-STABLE');
  assert.equal(snapshot.messages['MSG-1'].executionState, 'SUCCESS');
  assert.equal(lifecycle.getEvents('MSG-1').length, 4);
});

test('meaningful change markers are separate from event history and no-op state reads do not invent changes', async () => {
  const { createChatLifecycle } = await loadModule();
  const lifecycle = createChatLifecycle({ storage:memoryStorage() });

  lifecycle.commitMessage({ id:'MSG-1', body:'ทิป 59', role:'user' });
  lifecycle.transition('MSG-1', {
    executionState:'WAITING',
    readbackState:'IDLE',
    eventType:'NEEDS_INPUT',
  });
  lifecycle.transition('MSG-1', {
    executionState:'WAITING',
    readbackState:'IDLE',
    eventType:'POLL_SAME_STATE',
  });

  const events = lifecycle.getEvents('MSG-1');
  const changes = lifecycle.getChanges('MSG-1');
  assert.equal(events.length, 3);
  assert.equal(changes.length, 2, 'message commit + first state change only');
  assert.equal(changes.at(-1).to.executionState, 'WAITING');
});

test('execution state and readback state remain independent when readback fails', async () => {
  const { createChatLifecycle } = await loadModule();
  const lifecycle = createChatLifecycle({ storage:memoryStorage() });
  lifecycle.commitMessage({ id:'MSG-1', body:'ขายมือถือ 566', role:'user' });
  lifecycle.transition('MSG-1', {
    executionState:'WAITING',
    readbackState:'ERROR',
    error:'STORE_READBACK_FAILED',
    eventType:'READBACK_FAILED',
  });
  const current = lifecycle.getMessage('MSG-1');
  assert.equal(current.executionState, 'WAITING');
  assert.equal(current.readbackState, 'ERROR');
  assert.equal(current.error, 'STORE_READBACK_FAILED');
});

test('CHAT app wires mutation drafts and durable outcomes into lifecycle without using it as business truth', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /createChatLifecycle/);
  assert.match(app, /chatLifecycle\.commitMessage/);
  assert.match(app, /CONFIRMATION_REQUIRED/);
  assert.match(app, /EXECUTION_STARTED/);
  assert.match(app, /READBACK_VERIFIED/);
  assert.match(app, /READBACK_FAILED/);
  assert.match(app, /CANCELLED/);
  assert.doesNotMatch(fs.readFileSync(modulePath, 'utf8'), /LEDGER_CREATE|STORE_|RIDE_|otherIncome|sellProduct|expense\(/);
});
