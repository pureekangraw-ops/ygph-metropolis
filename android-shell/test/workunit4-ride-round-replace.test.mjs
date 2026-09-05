import test from 'node:test';
import assert from 'node:assert/strict';
import { createGreenfieldState } from '../../greenfield/core.mjs';
import { createMemoryVaultStore, commitEncryptedState } from '../../greenfield/persistence.mjs';
import { createCanonicalGreenfieldRuntime } from '../../greenfield/canonical-runtime-bridge.mjs';
import { createStableAppServices } from '../app/public/app/stable-service-composition.mjs';

const SECRET = 'LH-ride-round-test-secret';
const NOW = '2026-09-06T04:10:00.000Z';

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

test('MANUAL start-new-round closes the existing round through the shared Gateway before opening the new round', async () => {
  const { runtime, services } = await fixture();
  const first = await services.manual.rideStartRound({ workflowId:'WF-RIDE-1', roundId:'ROUND-1' });
  assert.equal(first.status, 'VERIFIED');

  const second = await services.manual.rideStartRound({ workflowId:'WF-RIDE-2', roundId:'ROUND-2' });
  assert.equal(second.status, 'VERIFIED');

  const durable = await runtime.readState();
  assert.equal(durable.domains.RIDE.records['ROUND-1']?.record?.status, 'CLOSED');
  assert.equal(durable.domains.RIDE.records['ROUND-2']?.record?.status, 'ACTIVE');
  const active = Object.values(durable.domains.RIDE.records)
    .map(entry => entry?.record)
    .filter(record => record?.type === 'ROUND' && record.status === 'ACTIVE');
  assert.deepEqual(active.map(record => record.recordId), ['ROUND-2']);
});
