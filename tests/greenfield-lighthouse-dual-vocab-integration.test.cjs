"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

async function route(text, fallback = async () => { throw new Error('PROVIDER_MUST_NOT_RUN'); }) {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  return routeMasterInputText(text, {
    receivedAt:'2026-08-29T01:00:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:()=> 'D16-REQ',
    interpretFallback:fallback,
  });
}

function evidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE',
    formatVersion:3,
    evidenceSchemaVersion:'3.1',
    packageId:'FLOW-D16-RUNTIME',
    packageMode:'SNAPSHOT_AND_DELTA',
    snapshotAsOf:'2026-08-29T00:30:00.000Z',
    sourceRevision:1,
    reconciliation:{ status:'PASS', blockingIssues:[] },
    events:[{
      eventId:'D16-0', source:'LEDGER', owner:'LEDGER',
      payload:{ record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:0, calculation:{ openingBalanceSatang:0 } } },
      validation:{ ownerConfirmation:'UNCONFIRMED' },
    }],
  });
}

async function runtimeTools() {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const { createPathKernel } = await import('../lighthouse/path-kernel.mjs');
  const runtime = createGreenfieldRuntime({
    store:createMemoryVaultStore(),
    passphrase:'correct horse battery staple',
    lockManager:null,
    now:()=>'2026-08-29T01:00:00.000Z',
  });
  const initial = await runtime.initializeFromEvidence(evidence(), {
    expectedPackageId:'FLOW-D16-RUNTIME', expectedRevision:1,
  });
  assert.equal(initial.status, 'IMPORTED_VERIFIED');
  return { runtime, kernel:createPathKernel({ capabilities:[createExpenseCapability()] }) };
}

function transactions(state) {
  return Object.values(state.domains.LEDGER.records)
    .map(entry => entry.record)
    .filter(record => record.type === 'TRANSACTION');
}

test('D16A polite single clear command uses one local path and never calls provider', async () => {
  let providerCalls = 0;
  const routed = await route('ช่วยลงข้าว65ให้หน่อยครับ', async () => { providerCalls += 1; throw new Error('PROVIDER_MUST_NOT_RUN'); });
  assert.equal(routed.route, 'LOCAL_PATH');
  assert.equal(routed.decision.route, 'DIRECT');
  assert.equal(routed.prepared.request.fields.title, 'ข้าว');
  assert.equal(routed.prepared.request.fields.amountSatang, 6500);
  assert.equal(providerCalls, 0);
});

test('D16B multi-group route fails closed before provider when durable revision is absent', async () => {
  let providerCalls = 0;
  const routed = await route('ลงข้าว65 แล้วลงน้ำมัน500', async () => { providerCalls += 1; throw new Error('PROVIDER_MUST_NOT_RUN'); });
  assert.equal(routed.route, 'STOP');
  assert.equal(routed.decision.route, 'INTERPRET');
  assert.equal(routed.reason, 'MULTI_GROUP_BASE_REVISION_REQUIRED');
  assert.equal(routed.prepared.request, null);
  assert.equal(providerCalls, 0);
});

test('D16C known calendar typo reaches interpreted unsupported state without inventing calendar capability', async () => {
  let providerCalls = 0;
  const routed = await route('วันที่15 มีนัด ช่วยลงปติธินให้หน่อย', async () => { providerCalls += 1; throw new Error('PROVIDER_MUST_NOT_RUN'); });
  assert.equal(routed.route, 'STOP');
  assert.equal(routed.decision.route, 'INTERPRET');
  assert.equal(routed.status, 'UNSUPPORTED');
  assert.equal(routed.reason, 'INTERPRETED_CAPABILITY_NOT_CONNECTED');
  assert.equal(routed.interpretation.capability, 'NOT_CONNECTED');
  assert.equal(routed.intent, null);
  assert.equal(providerCalls, 0);
});

test('D16D local question stays local QUERY and never creates a request', async () => {
  let providerCalls = 0;
  const routed = await route('ลงข้าว65หรือยัง', async () => { providerCalls += 1; throw new Error('PROVIDER_MUST_NOT_RUN'); });
  assert.equal(routed.route, 'LOCAL_QUERY');
  assert.equal(routed.decision.route, 'INTERPRET');
  assert.equal(routed.intent.action, 'QUERY');
  assert.equal(routed.prepared.request, null);
  assert.equal(providerCalls, 0);
});

test('D16E provider-owned query keeps the existing provider route exactly once', async () => {
  const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');
  let providerCalls = 0;
  const text = 'วันนี้วิ่งถึง1000หรือยัง';
  const routed = await route(text, async raw => {
    providerCalls += 1;
    assert.equal(raw, text);
    return gateIntentProposal({
      action:'QUERY', object:'RIDE_TODAY_SUMMARY',
      fields:{ title:null, amountBaht:null, paymentMode:null, note:null },
    });
  });
  assert.equal(routed.route, 'PROVIDER');
  assert.equal(routed.intent.action, 'QUERY');
  assert.equal(providerCalls, 1);
});

test('D16F local direct route does not mutate before execute and retry does not duplicate durable write', async () => {
  const { runtime, kernel } = await runtimeTools();
  const routed = await route('ช่วยลงข้าว65ให้หน่อยครับ');
  assert.equal(routed.route, 'LOCAL_PATH');
  assert.equal(transactions(await runtime.readState()).length, 0);

  const first = await kernel.run(routed.prepared.request, { runtime });
  assert.equal(first.status, 'COMPLETE');
  let records = transactions(await runtime.readState());
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'ข้าว');
  assert.equal(records[0].amountSatang, 6500);

  const retry = await kernel.run(routed.prepared.request, { runtime });
  assert.equal(retry.status, 'COMPLETE');
  records = transactions(await runtime.readState());
  assert.equal(records.length, 1);
});

test('D16G multi-group stop leaves a real runtime unchanged', async () => {
  const { runtime } = await runtimeTools();
  const routed = await route('ลงข้าว65 แล้วลงน้ำมัน500');
  assert.equal(routed.route, 'STOP');
  assert.equal(routed.prepared.request, null);
  assert.equal(transactions(await runtime.readState()).length, 0);
});
