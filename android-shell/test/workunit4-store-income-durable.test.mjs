import test from 'node:test';
import assert from 'node:assert/strict';
import { createGreenfieldState } from '../../greenfield/core.mjs';
import { createMemoryVaultStore, commitEncryptedState } from '../../greenfield/persistence.mjs';
import { createCanonicalGreenfieldRuntime } from '../../greenfield/canonical-runtime-bridge.mjs';
import { createStableAppServices } from '../app/public/app/stable-service-composition.mjs';

const SECRET = 'LH-store-income-test-secret';
const NOW = '2026-09-06T04:00:00.000Z';

async function fixture() {
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:NOW });
  await commitEncryptedState({ store, passphrase:SECRET, state, expectedDurableRevision:null });
  const runtime = createCanonicalGreenfieldRuntime({ store, passphrase:SECRET, lockManager:null, now:() => NOW });
  const owners = {
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
  const services = await createStableAppServices({ runtime, ...owners, now:() => NOW });
  return { runtime, services };
}

test('Store non-sale income commits durable STORE + Ledger truth with no quantity', async () => {
  const { runtime, services } = await fixture();
  const result = await services.manual.storeIncome({
    workflowId:'WF-STORE-INCOME-DURABLE-1',
    storeIncomeId:'STORE-INCOME-DURABLE-1',
    ledgerTransactionId:'TX-STORE-INCOME-DURABLE-1',
    title:'เงินเข้าร้านอย่างอื่น',
    amountSatang:30000,
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.readback.owner, 'STORE');
  const durable = await runtime.readState();
  const storeRecord = durable.domains.STORE.records['STORE-INCOME-DURABLE-1']?.record;
  const ledgerRecord = durable.domains.LEDGER.records['TX-STORE-INCOME-DURABLE-1']?.record;
  assert.equal(storeRecord?.type, 'INCOME');
  assert.equal(storeRecord?.amountSatang, 30000);
  assert.equal(Object.hasOwn(storeRecord, 'quantity'), false);
  assert.equal(ledgerRecord?.direction, 'IN');
  assert.equal(ledgerRecord?.subtype, 'STORE_INCOME');
  assert.equal(ledgerRecord?.sourceRef, 'STORE/STORE-INCOME-DURABLE-1');
});
