import test from 'node:test';
import assert from 'node:assert/strict';
import { createGreenfieldState } from '../../greenfield/core.mjs';
import { createMemoryVaultStore, commitEncryptedState } from '../../greenfield/persistence.mjs';
import { createCanonicalGreenfieldRuntime } from '../../greenfield/canonical-runtime-bridge.mjs';
import { createStableAppServices } from '../app/public/app/stable-service-composition.mjs';
import { projectRideRound } from '../../greenfield/ride-domain.mjs';

const SECRET = 'LH-reverse-owner-test-secret';
const NOW = '2026-09-06T04:20:00.000Z';

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

async function assertNoFakeIncomeOrOutcome(services) {
  const income = await services.manual.incomeSummary();
  const outcome = await services.manual.outcomeSummary();
  assert.equal(income.actualSatang, 0);
  assert.equal(outcome.actualSatang, 0);
}

test('reversing a Store sale propagates cancellation to Store truth and projections', async () => {
  const { runtime, services } = await fixture();
  await services.manual.storeSale({
    workflowId:'WF-SALE-REV-1', saleId:'SALE-REV-1', ledgerTransactionId:'TX-SALE-REV-1',
    title:'ขายสบู่', amountSatang:50000, quantity:1, receivedSatang:50000, storeCostSatang:0,
  });
  await services.manual.reverse({
    workflowId:'WF-REV-SALE-1', originalRecordId:'TX-SALE-REV-1', recordId:'TX-REV-SALE-1', reason:'ยกเลิกรายการ',
  });

  const durable = await runtime.readState();
  assert.equal(durable.domains.STORE.records['SALE-REV-1']?.record?.status, 'CANCELLED');
  assert.equal(durable.domains.LEDGER.records['TX-REV-SALE-1']?.record?.reversalOf, 'TX-SALE-REV-1');
  await assertNoFakeIncomeOrOutcome(services);
});

test('reversing a Ride cash job propagates cancellation to Ride truth and projections', async () => {
  const { runtime, services } = await fixture();
  await services.manual.rideStartRound({ workflowId:'WF-RIDE-REV-START', roundId:'ROUND-REV-1' });
  await services.manual.rideJob({
    workflowId:'WF-RIDE-JOB-REV-1', roundId:'ROUND-REV-1', jobId:'JOB-REV-1', ledgerTransactionId:'TX-RIDE-REV-1',
    amountSatang:35000, paymentMode:'CASH', note:'',
  });
  await services.manual.reverse({
    workflowId:'WF-REV-RIDE-1', originalRecordId:'TX-RIDE-REV-1', recordId:'TX-REV-RIDE-1', reason:'ยกเลิกรายการ',
  });

  const durable = await runtime.readState();
  assert.equal(durable.domains.RIDE.records['JOB-REV-1']?.record?.status, 'CANCELLED');
  assert.equal(projectRideRound(durable, 'ROUND-REV-1')?.generatedSatang, 0);
  assert.equal(projectRideRound(durable, 'ROUND-REV-1')?.jobCount, 0);
  assert.equal(durable.domains.LEDGER.records['TX-REV-RIDE-1']?.record?.reversalOf, 'TX-RIDE-REV-1');
  await assertNoFakeIncomeOrOutcome(services);
});

test('a Ledger transaction cannot be reversed twice', async () => {
  const { services } = await fixture();
  await services.manual.addIncome({ workflowId:'WF-IN-REV-1', recordId:'TX-IN-REV-1', title:'รายได้อื่น', amountSatang:10000 });
  await services.manual.reverse({ workflowId:'WF-REV-1', originalRecordId:'TX-IN-REV-1', recordId:'TX-REV-1', reason:'ยกเลิก' });
  await assert.rejects(
    services.manual.reverse({ workflowId:'WF-REV-2', originalRecordId:'TX-IN-REV-1', recordId:'TX-REV-2', reason:'ยกเลิกซ้ำ' }),
    /TRANSACTION_ALREADY_REVERSED/,
  );
});
