import test from 'node:test';
import assert from 'node:assert/strict';
import { createGreenfieldState } from '../../greenfield/core.mjs';
import { createMemoryVaultStore, commitEncryptedState } from '../../greenfield/persistence.mjs';
import { createCanonicalGreenfieldRuntime } from '../../greenfield/canonical-runtime-bridge.mjs';
import { createStableAppServices } from '../app/public/app/stable-service-composition.mjs';

const PASSPHRASE = 'LH-ledger-gateway-domain-passphrase';
const NOW = '2026-09-05T09:50:00.000Z';

async function fixture() {
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:NOW });
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  const runtime = createCanonicalGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => NOW });
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

test('Outcome expense crosses Ledger Gateway and commits Ledger OUT truth', async () => {
  const { runtime, services } = await fixture();
  const result = await services.manual.addExpense({
    workflowId:'WF-GATEWAY-OUTCOME-1',
    recordId:'TX-GATEWAY-OUTCOME-1',
    title:'ค่าอาหาร',
    amountSatang:12000,
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.readback.direction, 'OUT');
  const durable = await runtime.readState();
  assert.equal(durable.domains.LEDGER.records['TX-GATEWAY-OUTCOME-1']?.record?.direction, 'OUT');
  assert.equal(durable.domains.LEDGER.records['TX-GATEWAY-OUTCOME-1']?.record?.amountSatang, 12000);
});

test('Calendar mutation crosses Ledger Gateway while Calendar remains the single record owner', async () => {
  const { runtime, services } = await fixture();
  const result = await services.manual.createCalendarItem({
    workflowId:'WF-GATEWAY-CALENDAR-1',
    recordId:'CAL-GATEWAY-1',
    type:'REMINDER',
    title:'นัดลูกค้า',
    dueDate:'2026-09-06',
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.readback.recordId, 'CAL-GATEWAY-1');
  const durable = await runtime.readState();
  assert.equal(durable.domains.CALENDAR.records['CAL-GATEWAY-1']?.record?.status, 'OPEN');
  assert.equal(durable.domains.LEDGER.records['CAL-GATEWAY-1'], undefined);
});
