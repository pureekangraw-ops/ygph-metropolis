"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('coordinator uses Web Locks exclusive lock when available and serializes tasks', async () => {
  const { createMutationCoordinator, GREENFIELD_WRITE_LOCK } = await import('../greenfield/mutation-coordinator.mjs');
  const events = [];
  let active = 0;
  let maxActive = 0;
  const queue = [];
  const lockManager = {
    request(name, options, task) {
      assert.equal(name, GREENFIELD_WRITE_LOCK);
      assert.deepEqual(options, { mode: 'exclusive' });
      const run = async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        try { return await task(); }
        finally { active -= 1; }
      };
      const next = (queue.at(-1) || Promise.resolve()).then(run, run);
      queue.push(next.catch(() => undefined));
      return next;
    }
  };
  const coordinator = createMutationCoordinator({ lockManager });
  const gate = deferred();
  const first = coordinator.run(async () => { events.push('a:start'); await gate.promise; events.push('a:end'); return 'A'; });
  const second = coordinator.run(async () => { events.push('b:start'); events.push('b:end'); return 'B'; });
  await Promise.resolve();
  assert.deepEqual(events, ['a:start']);
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['A', 'B']);
  assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end']);
  assert.equal(maxActive, 1);
  assert.equal(coordinator.status().mode, 'WEB_LOCKS');
});

test('coordinator serializes same-context tasks with local queue fallback and reports limited scope', async () => {
  const { createMutationCoordinator } = await import('../greenfield/mutation-coordinator.mjs');
  const coordinator = createMutationCoordinator({ lockManager: null });
  const events = [];
  const gate = deferred();
  const first = coordinator.run(async () => { events.push('a:start'); await gate.promise; events.push('a:end'); });
  const second = coordinator.run(async () => { events.push('b:start'); events.push('b:end'); });
  await Promise.resolve();
  assert.deepEqual(events, ['a:start']);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end']);
  assert.deepEqual(coordinator.status(), { mode: 'LOCAL_QUEUE', crossContextSafety: 'LIMITED' });
});

test('workflow coordinator prevents lost updates across concurrent workflows', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { createMutationCoordinator } = await import('../greenfield/mutation-coordinator.mjs');

  const store = createMemoryVaultStore();
  const state = createGreenfieldState();
  state.domains.LEDGER.records.CURRENT = { record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0, calculation:{openingBalanceSatang:0}}, provenance:{origin:'EVIDENCE_IMPORT'} };
  await commitEncryptedState({ store, passphrase:'correct horse battery staple', state, expectedDurableRevision:null });
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-12T11:30:00.000Z' });
  const coordinator = createMutationCoordinator({ lockManager: null });
  const run = commands => coordinator.run(() => executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands }));

  await Promise.all([
    run([{ commandId:'A', idempotencyKey:'A', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{recordId:'TX-A',direction:'IN',amountSatang:1000,title:'A',subtype:'OTHER_INCOME'} }]),
    run([{ commandId:'B', idempotencyKey:'B', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{recordId:'TX-B',direction:'IN',amountSatang:2000,title:'B',subtype:'OTHER_INCOME'} }])
  ]);
  const durable = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  assert.ok(durable.domains.LEDGER.records['TX-A']);
  assert.ok(durable.domains.LEDGER.records['TX-B']);
  assert.equal(durable.revision, 3);
});
