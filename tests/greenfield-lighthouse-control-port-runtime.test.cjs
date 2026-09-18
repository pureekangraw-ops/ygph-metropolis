const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { readFileSync } = require('node:fs');

const runtimeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/control-port-runtime.mjs')).href;

function fakePort(clock) {
  let ownerRevision = 10;
  let ready = true;
  let mutationCount = 0;

  function guardFor(capabilityId) {
    if (capabilityId.startsWith('security.') || capabilityId === 'finance.balance') return 'FORBIDDEN';
    if (capabilityId === 'finance.dailyGoal') return 'DIRECT';
    return 'CONFIRM_REQUIRED';
  }

  const port = {
    propose({ requestId, capabilityId, payload = {} }) {
      return {
        requestId,
        capabilityId,
        payload,
        guard:guardFor(capabilityId),
        owner:capabilityId.startsWith('store.') ? 'GREENFIELD:STORE' : 'GREENFIELD:LEDGER',
        action:capabilityId,
      };
    },
    async commit(proposal, { confirmed = false } = {}) {
      const guard = guardFor(proposal.capabilityId);
      if (guard === 'FORBIDDEN') throw new Error('LIGHTHOUSE_CONTROL_PORT_MUTATION_FORBIDDEN');
      if (guard === 'CONFIRM_REQUIRED' && !confirmed) {
        return { status:'CONFIRMATION_REQUIRED', revision:ownerRevision, updatedAt:clock.value };
      }
      if (!ready) throw new Error('RUNTIME_SESSION_LOCKED');
      if (proposal.payload?.forceReadbackFailure) throw new Error('LIGHTHOUSE_CONTROL_PORT_READBACK_MISMATCH');
      const beforeRevision = ownerRevision;
      ownerRevision += 1;
      mutationCount += 1;
      return {
        status:'VERIFIED',
        requestId:proposal.requestId,
        capabilityId:proposal.capabilityId,
        beforeRevision,
        afterRevision:ownerRevision,
        revision:ownerRevision,
        updatedAt:clock.value,
        readbackAt:clock.value,
        evidence:{ marker:proposal.requestId },
      };
    },
    async query({ capabilityId }) {
      if (!ready) throw new Error('RUNTIME_SESSION_LOCKED');
      return {
        status:'OK',
        capabilityId,
        value:{ id:capabilityId },
        revision:ownerRevision,
        updatedAt:clock.value,
      };
    },
    async health() {
      return {
        status:ready ? 'HEALTHY' : 'DEGRADED',
        revision:ready ? ownerRevision : null,
        updatedAt:ready ? clock.value : null,
      };
    },
    async status() {
      return {
        status:ready ? 'READY' : 'LOCKED',
        revision:ready ? ownerRevision : null,
        updatedAt:ready ? clock.value : null,
      };
    },
    setReady(value) { ready = Boolean(value); },
    getMutationCount() { return mutationCount; },
  };
  return port;
}


test('LIGHTHOUSE app activates Control Port only after owner unlock and reads staged build identity', () => {
  const appSource = readFileSync(path.resolve(__dirname, '../lighthouse-next/app.mjs'), 'utf8');
  assert.match(appSource, /createLighthouseControlPort\(\{ ledgerBridge, storeBridge \}\)/);
  assert.match(appSource, /createLighthouseControlPortRuntime\(/);
  assert.match(appSource, /fetch\('\.\/build-identity\.json', \{ cache:'no-store' \}\)/);
  assert.match(appSource, /buildState:\{\s*status:'UNKNOWN'/);
  assert.match(appSource, /try \{ await controlPortRuntime\.refreshSnapshot\(\); \} catch \{\}/);
  assert.doesNotMatch(appSource, /mainSha:\s*['"][0-9a-f]{40}['"]/);
});


test('Inbox persists across restart and stable requestId prevents duplicate mutation', async () => {
  const { createLighthouseControlPortRuntime, createMemoryControlPortStorage } = await import(runtimeUrl);
  const clock = { value:'2026-09-18T07:10:00.000Z' };
  const storage = createMemoryControlPortStorage();
  const port = fakePort(clock);

  const first = createLighthouseControlPortRuntime({ port, storage, now:() => clock.value });
  first.receive({
    requestId:'goal-1',
    capabilityId:'finance.dailyGoal',
    payload:{ goalBaht:1200 },
  });

  const restarted = createLighthouseControlPortRuntime({ port, storage, now:() => clock.value });
  const receipt = await restarted.process('goal-1');
  assert.equal(receipt.status, 'DONE');
  assert.equal(port.getMutationCount(), 1);

  const retryReceipt = await restarted.process('goal-1');
  assert.deepEqual(retryReceipt, receipt);
  assert.equal(port.getMutationCount(), 1);

  restarted.receive({
    requestId:'goal-1',
    capabilityId:'finance.dailyGoal',
    payload:{ goalBaht:1200 },
  });
  assert.throws(() => restarted.receive({
    requestId:'goal-1',
    capabilityId:'finance.dailyGoal',
    payload:{ goalBaht:1300 },
  }), /REQUEST_ID_CONFLICT/);
});

test('Confirmation-required command survives restart and completes only after confirmation', async () => {
  const { createLighthouseControlPortRuntime, createMemoryControlPortStorage } = await import(runtimeUrl);
  const clock = { value:'2026-09-18T07:20:00.000Z' };
  const storage = createMemoryControlPortStorage();
  const port = fakePort(clock);

  const first = createLighthouseControlPortRuntime({ port, storage, now:() => clock.value });
  first.receive({
    requestId:'income-1',
    capabilityId:'finance.income.create',
    payload:{ source:'งาน', amountBaht:100 },
  });
  const waiting = await first.process('income-1');
  assert.equal(waiting.status, 'BLOCKED');
  assert.equal(waiting.reason, 'CONFIRMATION_REQUIRED');
  assert.equal(port.getMutationCount(), 0);

  const restarted = createLighthouseControlPortRuntime({ port, storage, now:() => clock.value });
  assert.equal(restarted.inbox()[0].status, 'CONFIRMATION_REQUIRED');
  const done = await restarted.confirm('income-1');
  assert.equal(done.status, 'DONE');
  assert.equal(port.getMutationCount(), 1);
});

test('Forbidden/secret commands are blocked without persisting secret payload', async () => {
  const { createLighthouseControlPortRuntime, createMemoryControlPortStorage, CONTROL_PORT_STORAGE_KEY } = await import(runtimeUrl);
  const clock = { value:'2026-09-18T07:30:00.000Z' };
  const storage = createMemoryControlPortStorage();
  const port = fakePort(clock);
  const runtime = createLighthouseControlPortRuntime({ port, storage, now:() => clock.value });

  const received = runtime.receive({
    requestId:'secret-1',
    capabilityId:'security.pin',
    payload:{ pin:'1234', nested:{ recoveryCode:'DO-NOT-STORE' } },
  });
  assert.equal(received.payload, null);
  assert.equal(received.payloadRedacted, true);

  const receipt = await runtime.process('secret-1');
  assert.equal(receipt.status, 'BLOCKED');
  const raw = storage.dump()[CONTROL_PORT_STORAGE_KEY];
  assert.doesNotMatch(raw, /1234|DO-NOT-STORE|recoveryCode/);
  assert.equal(port.getMutationCount(), 0);
});

test('Readback mismatch emits VERIFY and runtime-blocked command can reconcile later with same requestId', async () => {
  const { createLighthouseControlPortRuntime, createMemoryControlPortStorage } = await import(runtimeUrl);
  const clock = { value:'2026-09-18T07:40:00.000Z' };
  const storage = createMemoryControlPortStorage();
  const port = fakePort(clock);
  const runtime = createLighthouseControlPortRuntime({ port, storage, now:() => clock.value });

  runtime.receive({
    requestId:'verify-1',
    capabilityId:'finance.dailyGoal',
    payload:{ goalBaht:1000, forceReadbackFailure:true },
  });
  const verify = await runtime.process('verify-1');
  assert.equal(verify.status, 'VERIFY');

  runtime.receive({
    requestId:'offline-1',
    capabilityId:'finance.dailyGoal',
    payload:{ goalBaht:1100 },
  });
  port.setReady(false);
  const blocked = await runtime.process('offline-1');
  assert.equal(blocked.status, 'BLOCKED');
  port.setReady(true);
  const processed = await runtime.processPending();
  assert.equal(processed.some(item => item.requestId === 'offline-1' && item.status === 'DONE'), true);
});


test('Snapshot contract carries source metadata and latest owner readback without inventing unknown states', async () => {
  const {
    createLighthouseControlPortRuntime,
    createMemoryControlPortStorage,
    CONTROL_PORT_SNAPSHOT_CONTRACT_VERSION,
  } = await import(runtimeUrl);
  const clock = { value:'2026-09-18T07:50:00.000Z' };
  const storage = createMemoryControlPortStorage();
  const port = fakePort(clock);
  const runtime = createLighthouseControlPortRuntime({
    port,
    storage,
    now:() => clock.value,
    snapshotMetadata:() => ({
      appVersion:'1.0.0-owner.3',
      mainSha:'main-sha-123',
      buildState:{ status:'PASS', runId:42 },
      deployState:{ status:'STAGING', environment:'staging' },
      updaterState:{ status:'IDLE' },
      source:{ repository:'pureekangraw-ops/ygph-metropolis', branch:'feat/lighthouse-hub-control-port-20260918' },
      owner:{ system:'METROPOLIS', runtime:'LIGHTHOUSE_CONTROL_PORT' },
    }),
  });

  runtime.receive({
    requestId:'goal-contract-1',
    capabilityId:'finance.dailyGoal',
    payload:{ goalBaht:1400 },
  });
  const receipt = await runtime.process('goal-contract-1');
  assert.equal(receipt.status, 'DONE');

  const snapshot = await runtime.refreshSnapshot();
  assert.equal(snapshot.contractVersion, CONTROL_PORT_SNAPSHOT_CONTRACT_VERSION);
  assert.equal(snapshot.appVersion, '1.0.0-owner.3');
  assert.equal(snapshot.mainSha, 'main-sha-123');
  assert.equal(snapshot.buildState.status, 'PASS');
  assert.equal(snapshot.deployState.status, 'STAGING');
  assert.equal(snapshot.runtimeState.status, 'ACTIVE');
  assert.equal(snapshot.updaterState.status, 'IDLE');
  assert.equal(snapshot.source.repository, 'pureekangraw-ops/ygph-metropolis');
  assert.equal(snapshot.owner.system, 'METROPOLIS');
  assert.equal(snapshot.readbackSummary.requestId, 'goal-contract-1');

  const unknownRuntime = createLighthouseControlPortRuntime({
    port,
    storage:createMemoryControlPortStorage(),
    now:() => clock.value,
  });
  const unknown = await unknownRuntime.refreshSnapshot();
  assert.equal(unknown.appVersion, null);
  assert.equal(unknown.mainSha, null);
  assert.equal(unknown.buildState.status, 'UNKNOWN');
  assert.equal(unknown.deployState.status, 'UNKNOWN');
  assert.equal(unknown.updaterState.status, 'UNKNOWN');
});


test('Snapshot freshness distinguishes LIVE, STALE, and OFFLINE without rewriting owner updatedAt', async () => {
  const { createLighthouseControlPortRuntime, createMemoryControlPortStorage } = await import(runtimeUrl);
  const clock = { value:'2026-09-18T08:00:00.000Z' };
  const storage = createMemoryControlPortStorage();
  const port = fakePort(clock);
  const runtime = createLighthouseControlPortRuntime({
    port,
    storage,
    now:() => clock.value,
    staleAfterMs:5 * 60 * 1000,
  });

  const live = await runtime.refreshSnapshot();
  assert.equal(live.freshness, 'LIVE');
  assert.equal(live.updatedAt, '2026-09-18T08:00:00.000Z');

  clock.value = '2026-09-18T08:10:01.000Z';
  const stale = await runtime.snapshotStatus();
  assert.equal(stale.freshness, 'STALE');
  assert.equal(stale.updatedAt, '2026-09-18T08:00:00.000Z');

  port.setReady(false);
  const offline = await runtime.snapshotStatus();
  assert.equal(offline.freshness, 'OFFLINE');
  assert.equal(offline.snapshot.updatedAt, '2026-09-18T08:00:00.000Z');
});
