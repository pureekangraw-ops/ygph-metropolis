const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const syncUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/control-port-sync.mjs')).href;

test('Transport-neutral sync reconciles inbox/outbox/state and tolerates transport outage', async () => {
  const { createLighthouseControlPortSync } = await import(syncUrl);
  const received = [];
  const pushed = { receipts:null, state:null };
  const runtime = {
    receive(command) { received.push(command); return command; },
    async processPending() { return [{ requestId:'r1', status:'DONE' }]; },
    async refreshSnapshot() { return { freshness:'LIVE', revision:4 }; },
    async snapshotStatus() { return { freshness:'STALE', revision:3 }; },
    outbox() { return [{ requestId:'r1', status:'DONE' }]; },
    workState() { return { nextAction:'WAITING_COMMAND' }; },
  };

  const sync = createLighthouseControlPortSync({ runtime, now:() => '2026-09-18T09:00:00.000Z' });
  const online = await sync.reconcile({
    pullInbox:async () => [{ requestId:'r1', capabilityId:'finance.dailyGoal', payload:{goalBaht:1000} }],
    pushOutbox:async value => { pushed.receipts = value; },
    pushState:async value => { pushed.state = value; },
  });

  assert.equal(online.transport, 'ONLINE');
  assert.equal(online.received, 1);
  assert.equal(online.processed, 1);
  assert.equal(online.pushedReceipts, 1);
  assert.equal(online.snapshotFreshness, 'LIVE');
  assert.equal(received.length, 1);
  assert.equal(pushed.receipts[0].requestId, 'r1');
  assert.equal(pushed.state.work.nextAction, 'WAITING_COMMAND');

  const offline = await sync.reconcile({
    pullInbox:async () => { throw new Error('NETWORK_DOWN'); },
    pushOutbox:async () => { throw new Error('NETWORK_DOWN'); },
    pushState:async () => { throw new Error('NETWORK_DOWN'); },
  });
  assert.equal(offline.transport, 'OFFLINE');
  assert.equal(offline.processed, 1, 'local pending processing must remain available when transport is offline');
  assert.match(offline.errors.join('|'), /NETWORK_DOWN/);
});
