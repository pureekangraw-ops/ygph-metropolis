"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function initializedStore() {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-12T10:00:00.000Z' });
  state.domains.LEDGER.records.CURRENT = { record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0, calculation:{ openingBalanceSatang:0 } }, provenance:{ origin:'EVIDENCE_IMPORT' } };
  await commitEncryptedState({ store, passphrase:'correct horse battery staple', state, expectedDurableRevision:null });
  return store;
}

test('atomic workflow commits Store + Ledger commands in one durable write', async () => {
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { readEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = await initializedStore();
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-12T10:30:00.000Z' });
  const result = await executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'S1', idempotencyKey:'SALE:1', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'SALE1', type:'SALE', title:'ขายเงินสด', amountSatang:10000, quantity:1, status:'COMPLETED' } } },
    { commandId:'L1', idempotencyKey:'SALE:1:LEDGER', domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{ recordId:'TX1', direction:'IN', amountSatang:10000, title:'ขายเงินสด', subtype:'SALE', sourceRef:'STORE/SALE1' } }
  ]});
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.fromRevision, 1);
  assert.equal(result.toRevision, 3);
  assert.equal(result.appliedCommands, 2);
  const durable = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  assert.ok(durable.domains.STORE.records.SALE1);
  assert.ok(durable.domains.LEDGER.records.TX1);
});

test('atomic workflow writes nothing when a later command fails', async () => {
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const { executeAtomicWorkflow } = await import('../greenfield/workflow-runtime.mjs');
  const { readEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = await initializedStore();
  const before = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime);
  await assert.rejects(executeAtomicWorkflow({ store, passphrase:'correct horse battery staple', runtime, commands:[
    { commandId:'S1', idempotencyKey:'SALE:1', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'SALE1', type:'SALE', title:'ขายเงินสด', amountSatang:10000, quantity:1, status:'COMPLETED' } } },
    { commandId:'S2', idempotencyKey:'SALE:2', domain:'STORE', type:'STORE_CREATE_RECORD', payload:{ record:{ recordId:'SALE1', type:'SALE', title:'ซ้ำ', amountSatang:10000, quantity:1, status:'COMPLETED' } } }
  ]}), /DUPLICATE_DOMAIN_RECORD/);
  const after = await readEncryptedState({ store, passphrase:'correct horse battery staple' });
  assert.deepEqual(after, before);
});
