import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGreenfieldState } from '../../greenfield/core.mjs';
import { createMemoryVaultStore, commitEncryptedState } from '../../greenfield/persistence.mjs';
import { createCanonicalGreenfieldRuntime } from '../../greenfield/canonical-runtime-bridge.mjs';
import { createChatService } from '../app/public/logic/chat/chat-service.mjs';
import { createStableAppServices } from '../app/public/app/stable-service-composition.mjs';

const PASSPHRASE = 'LH-ledger-gateway-passphrase';
const NOW = '2026-09-05T09:30:00.000Z';

function memoryMetadataStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async put(key, value) { values.set(key, structuredClone(value)); },
  };
}

async function runtimeFixture() {
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:NOW });
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  return createCanonicalGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => NOW });
}

function externalOwners() {
  return {
    session:Object.freeze({ lock:async () => ({ status:'LOCKED' }) }),
    recovery:Object.freeze({ retry:async payload => ({ status:'VERIFIED', readback:structuredClone(payload) }) }),
    backup:Object.freeze({
      exportBackup:async () => ({ revision:1, exportedAt:NOW, artifactHash:'backup-hash' }),
      readback:async artifact => ({ status:'VERIFIED', revision:artifact.revision, exportedAt:artifact.exportedAt, artifactHash:artifact.artifactHash }),
    }),
    updates:Object.freeze({ snapshot:async () => ({ state:'IDLE' }) }),
    events:Object.freeze({ emit:async event => ({ status:'VERIFIED', readback:structuredClone(event) }) }),
    query:async payload => ({ status:'VERIFIED', readback:structuredClone(payload) }),
    provider:async payload => ({ status:'VERIFIED', readback:structuredClone(payload) }),
  };
}

test('CHAT LEDGER_COMMAND uses Ledger Gateway and requires verified readback', async () => {
  const calls = [];
  const chat = createChatService({
    store:memoryMetadataStore(),
    modules:{ execute:async () => ({ status:'VERIFIED', readback:{} }) },
    ledger:{ execute:async input => { calls.push(structuredClone(input)); return { status:'VERIFIED', readback:{ ledger:true } }; } },
  });
  const response = await chat.dispatch({
    requestId:'REQ-LEDGER-1',
    route:'LEDGER_COMMAND',
    payload:{ operation:'addIncome', payload:{ amountSatang:50000 } },
  });
  assert.equal(response.status, 'SUCCESS');
  assert.equal(response.result.readback.ledger, true);
  assert.deepEqual(calls, [{ operation:'addIncome', payload:{ amountSatang:50000 } }]);
});

test('stable composition gives CHAT and MANUAL the shared Ledger Gateway mutation path', async () => {
  const runtime = await runtimeFixture();
  const services = await createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });

  const chatResult = await services.chat.dispatch({
    requestId:'REQ-GATEWAY-COMPOSED-1',
    route:'LEDGER_COMMAND',
    payload:{
      operation:'addIncome',
      payload:{
        workflowId:'WF-GATEWAY-CHAT-1',
        recordId:'TX-GATEWAY-CHAT-1',
        title:'ร้านค้า training witness',
        amountSatang:50000,
      },
    },
  });
  assert.equal(chatResult.status, 'SUCCESS');
  assert.equal(chatResult.result.status, 'VERIFIED');
  assert.equal(chatResult.result.readback.recordId, 'TX-GATEWAY-CHAT-1');

  const manualResult = await services.manual.addIncome({
    workflowId:'WF-GATEWAY-MANUAL-1',
    recordId:'TX-GATEWAY-MANUAL-1',
    title:'manual gateway witness',
    amountSatang:35000,
  });
  assert.equal(manualResult.status, 'VERIFIED');

  const durable = await runtime.readState();
  assert.equal(durable.domains.LEDGER.records['TX-GATEWAY-CHAT-1']?.record?.amountSatang, 50000);
  assert.equal(durable.domains.LEDGER.records['TX-GATEWAY-MANUAL-1']?.record?.amountSatang, 35000);
});

test('stable composition wires Manual facade and CHAT through one internal Ledger Gateway without exposing a ninth app service', async () => {
  const source = await readFile(new URL('../app/public/app/stable-service-composition.mjs', import.meta.url), 'utf8');
  assert.match(source, /createLedgerGateway/);
  assert.match(source, /createManualLedgerFacade/);
  assert.match(source, /ledger:\s*ledgerGateway/);
  assert.match(source, /multiGroup:\s*ledgerGateway\.executeWorkflow/);

  const runtime = await runtimeFixture();
  const services = await createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });
  assert.deepEqual(Object.keys(services).sort(), ['backup','chat','events','manual','modules','recovery','session','updates']);
});
