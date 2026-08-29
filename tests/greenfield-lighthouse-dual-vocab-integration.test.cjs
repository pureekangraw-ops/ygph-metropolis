"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupProductionUi, transactionRecords } = require('./master-input-ui-fixture.cjs');

async function route(text, fallback = async () => { throw new Error('PROVIDER_MUST_NOT_RUN'); }) {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  return routeMasterInputText(text, {
    receivedAt:'2026-08-29T01:00:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:()=> 'D16-REQ',
    interpretFallback:fallback,
  });
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

test('D16B multi-group input is interpreted but stopped before provider or execution', async () => {
  let providerCalls = 0;
  const routed = await route('ลงข้าว65 แล้วลงน้ำมัน500', async () => { providerCalls += 1; throw new Error('PROVIDER_MUST_NOT_RUN'); });
  assert.equal(routed.route, 'STOP');
  assert.equal(routed.decision.route, 'INTERPRET');
  assert.equal(routed.reason, 'MULTI_GROUP_EXECUTION_NOT_CONNECTED');
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

test('D16F production UI direct route still waits for confirm and writes exactly once', async () => {
  const env = await setupProductionUi('D16F');
  try {
    assert.equal(await env.submit('ช่วยลงข้าว65ให้หน่อยครับ'), 'READY');
    assert.equal(env.providerCalls(), 0);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0);
    assert.equal(await env.execute(), 'SUCCESS');
    const records = transactionRecords(await env.runtime.readState());
    assert.equal(records.length, 1);
    assert.equal(records[0].title, 'ข้าว');
    assert.equal(records[0].amountSatang, 6500);
  } finally { env.cleanup(); }
});

test('D16G production UI multi-group route exposes no execute action and makes no write', async () => {
  const env = await setupProductionUi('D16G');
  try {
    assert.equal(await env.submit('ลงข้าว65 แล้วลงน้ำมัน500'), 'UNSUPPORTED');
    assert.equal(env.providerCalls(), 0);
    assert.equal(env.document.getElementById('masterInputActions').children.length, 0);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0);
  } finally { env.cleanup(); }
});
