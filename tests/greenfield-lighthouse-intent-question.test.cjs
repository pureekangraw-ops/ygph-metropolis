"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupProductionUi, transactionRecords } = require('./master-input-ui-fixture.cjs');

async function expense(env, id, title, amountSatang, businessDate) {
  await env.runtime.expense({
    workflowId:`WF-Q-${id}`, ledgerTransactionId:`TX-Q-${id}`,
    title, amountSatang, ...(businessDate ? { businessDate } : {}),
  });
}

async function searchThroughRuntime(env, text) {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  const { prepareMasterExecution, executePreparedMasterIntent } = await import('../greenfield/master-input-router.mjs');
  const routed = await routeMasterInputText(text, {
    receivedAt:'2026-08-28T02:00:00.000Z', timeZone:'Asia/Bangkok',
    requestIdFactory:()=> 'QUESTION-MUST-NOT-CREATE',
    interpretFallback:async()=> { throw new Error('QUERY_MUST_NOT_USE_PROVIDER'); },
  });
  assert.equal(routed.route, 'LOCAL_QUERY');
  assert.equal(routed.prepared.request, null, 'question has no CREATE PATH request');
  const prepared = prepareMasterExecution(routed.intent, { projection:env.runtime.project() });
  return executePreparedMasterIntent(env.runtime, prepared);
}

test('P1Q01 a question marker reclassifies only its own group and retains owned slots', async () => {
  const { parseIntentTask1 } = await import('../lighthouse/intent-parser.mjs');
  const raw = 'ลงข้าว65หรือยัง แต่ลงน้ำมัน500';
  const parsed = parseIntentTask1(raw);
  assert.equal(parsed.groups[0].intent, 'QUERY');
  assert.equal(parsed.groups[1].intent, 'COMMAND');
  const question = parsed.groups[0].slots.find(slot => slot.role === 'QUESTION');
  assert.equal(question.resolvedValue, 'QUERY');
  assert.equal(raw.slice(question.rawSpan.start, question.rawSpan.end), 'หรือยัง');
  assert.equal(parsed.groups[0].slots.find(slot => slot.role === 'TARGET').resolvedValue, 'ข้าว');
  assert.equal(parsed.groups[0].slots.find(slot => slot.role === 'MONEY').resolvedValue.amountSatang, 6500);
  assert.equal(parsed.groups[1].slots.some(slot => slot.role === 'QUESTION'), false);
});

test('P1Q02 UI highlights a question and searches durable records 10 -> 6 -> 1 without writes', async () => {
  const env = await setupProductionUi('Q02');
  try {
    const rows = [
      ['rice65','ข้าว',6500], ['rice70','ข้าว',7000], ['rice75','ข้าว',7500],
      ['rice80','ข้าว',8000], ['rice85','ข้าว',8500], ['rice90','ข้าว',9000],
      ['fuel65','น้ำมัน',6500], ['fuel70','น้ำมัน',7000],
      ['fuel75','น้ำมัน',7500], ['fuel80','น้ำมัน',8000],
    ];
    for (const row of rows) await expense(env, ...row);
    const before = await env.runtime.readState();
    const result = await searchThroughRuntime(env, 'ลงข้าว 65 หรือยัง');
    assert.equal(result.action, 'QUERY');
    assert.deepEqual(result.readback.steps.map(step => step.count), [10,6,1]);
    assert.equal(result.readback.record.recordId, 'TX-Q-rice65');
    assert.equal(await env.submit('ลงข้าว 65 หรือยัง'), 'SUCCESS');
    assert.equal(env.document.getElementById('masterInputQuestion').tagName, 'MARK');
    assert.equal(env.document.getElementById('masterInputQuestion').textContent, 'หรือยัง');
    assert.equal(env.document.getElementById('masterInputQuestionBox').hidden, false);
    assert.match(env.document.getElementById('masterInputMeta').textContent, /10 → 6 → 1/);
    assert.match(env.document.getElementById('masterInputMeta').textContent, /TX-Q-rice65/);
    assert.equal(env.document.getElementById('masterInputActions').children.length, 0);
    assert.equal(env.providerCalls(), 0);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q03 duplicates select newest recording time, not insertion order or business date', async () => {
  let now = '2026-08-28T03:00:00.000Z';
  const env = await setupProductionUi('Q03', { now:()=>now });
  try {
    await expense(env, 'newest', 'ข้าว', 6500, '2026-08-20');
    now = '2026-08-28T02:00:00.000Z';
    await expense(env, 'older', 'ข้าว', 6500, '2026-08-28');
    const before = await env.runtime.readState();
    const result = await searchThroughRuntime(env, 'ลงข้าว65หรือยัง');
    assert.deepEqual(result.readback.steps.map(step => step.count), [2,2,2]);
    assert.equal(result.readback.record.recordId, 'TX-Q-newest');
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q04 no exact amount match reports not found rather than choosing a nearby amount', async () => {
  const env = await setupProductionUi('Q04');
  try {
    await expense(env, 'nearby', 'ข้าว', 6400);
    const before = await env.runtime.readState();
    const result = await searchThroughRuntime(env, 'ลงข้าว65หรือยัง');
    assert.equal(result.readback.found, false);
    assert.equal(result.readback.record, null);
    assert.deepEqual(result.readback.steps.map(step => step.count), [1,1,0]);
    assert.equal(await env.submit('ลงข้าว65หรือยัง'), 'SUCCESS');
    assert.match(env.document.getElementById('masterInputTitle').textContent, /ไม่พบ/);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q05 correcting a question rejoins its query instead of turning into a create', async () => {
  const env = await setupProductionUi('Q05');
  try {
    await expense(env, 'corrected', 'ข้าว', 6500);
    const before = await env.runtime.readState();
    assert.equal(await env.submit('ลงข้าว1,50หรือยัง'), 'ASK');
    assert.equal(await env.submit('แก้ไข 65'), 'SUCCESS');
    assert.equal(env.document.getElementById('masterInputQuestion').textContent, 'หรือยัง');
    assert.equal(env.document.getElementById('masterInputActions').children.length, 0);
    assert.match(env.document.getElementById('masterInputMeta').textContent, /TX-Q-corrected/);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q06 questions preserve prohibition, condition and unsupported multi-group boundaries', async () => {
  const env = await setupProductionUi('Q06');
  try {
    const before = await env.runtime.readState();
    for (const text of ['ไม่ต้องลงข้าว65หรือยัง','ถ้าฝนตกค่อยลงข้าว65หรือยัง','ลงข้าว65หรือยัง แต่ลงน้ำมัน500']) {
      assert.equal(await env.submit(text), 'UNSUPPORTED');
      assert.equal(env.document.getElementById('masterInputActions').children.length, 0);
    }
    assert.equal(env.providerCalls(), 0);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q07 unrepresented query units or clock time are not discarded to return a match', async () => {
  const env = await setupProductionUi('Q07');
  try {
    await expense(env, 'must-not-match', 'ข้าว', 6500);
    const before = await env.runtime.readState();
    for (const text of ['ลงข้าว65%หรือยัง','ลงข้าว65ห้าโมงหรือยัง']) {
      assert.ok(['ASK','UNSUPPORTED'].includes(await env.submit(text)));
      assert.equal(env.document.getElementById('masterInputActions').children.length, 0);
    }
    assert.equal(env.providerCalls(), 0);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q08 a new command clears the question marker and still waits for explicit execute', async () => {
  const env = await setupProductionUi('Q08');
  try {
    assert.equal(await env.submit('ลงข้าว65หรือยัง'), 'SUCCESS');
    assert.equal(await env.submit('ลงข้าว65'), 'READY');
    assert.equal(env.document.getElementById('masterInputQuestionBox').hidden, true);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0);
    assert.equal(await env.execute(), 'SUCCESS');
    assert.equal(transactionRecords(await env.runtime.readState()).length, 1);
  } finally { env.cleanup(); }
});

test('P1Q09 a represented relative date narrows matches before choosing latest', async () => {
  const env = await setupProductionUi('Q09');
  try {
    await expense(env, 'yesterday', 'ข้าว', 6500, '2026-08-27');
    await expense(env, 'today', 'ข้าว', 6500, '2026-08-28');
    const result = await searchThroughRuntime(env, 'ลงข้าว65 เมื่อวานหรือยัง');
    assert.equal(result.readback.record.recordId, 'TX-Q-yesterday');
    assert.deepEqual(result.readback.steps.map(step => step.count), [2,2,2,1]);
  } finally { env.cleanup(); }
});

test('P1Q10 a date query includes ordinary records without businessDate using their Bangkok recording day', async () => {
  const env = await setupProductionUi('Q10', { now:()=> '2026-08-26T18:00:00.000Z' });
  try {
    await expense(env, 'ordinary-date', 'ข้าว', 6500);
    const before = await env.runtime.readState();
    const result = await searchThroughRuntime(env, 'ลงข้าว65 เมื่อวานหรือยัง');
    assert.equal(result.readback.record?.recordId, 'TX-Q-ordinary-date');
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q11 provider-owned questions retain the existing validated query route and marker', async () => {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');
  for (const text of ['วันนี้วิ่งถึง1000หรือยัง', 'วันนี้วิ่งถึงเป้าหรือยัง']) {
    let calls = 0;
    const routed = await routeMasterInputText(text, {
      receivedAt:'2026-08-28T02:00:00.000Z', timeZone:'Asia/Bangkok',
      interpretFallback:async raw => {
        calls += 1;
        assert.equal(raw, text);
        return gateIntentProposal({ action:'QUERY', object:'RIDE_TODAY_SUMMARY',
          fields:{ title:null, amountBaht:null, paymentMode:null, note:null } });
      },
    });
    assert.equal(routed.route, 'PROVIDER');
    assert.equal(routed.intent.status, 'READY');
    assert.equal(routed.intent.action, 'QUERY');
    assert.equal(routed.intent.object, 'RIDE_TODAY_SUMMARY');
    assert.equal(routed.prepared.parsed.groups[0].question.rawText, 'หรือยัง');
    assert.equal(calls, 1);
  }
});

test('P1Q12 a provider cannot turn a marked question into an executable create', async () => {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');
  let calls = 0;
  const routed = await routeMasterInputText('ลงน้ำมัน500หรือยัง', {
    receivedAt:'2026-08-28T02:00:00.000Z', timeZone:'Asia/Bangkok',
    interpretFallback:async () => {
      calls += 1;
      return gateIntentProposal({ action:'CREATE', object:'EXPENSE',
        fields:{ title:'น้ำมัน', amountBaht:500, paymentMode:null, note:null } });
    },
  });
  assert.equal(calls, 1, 'preserve existing provider routing for an unowned target');
  assert.equal(routed.route, 'STOP');
  assert.equal(routed.reason, 'QUERY_PROVIDER_ACTION_MISMATCH');
  assert.equal(routed.intent, null);
  assert.equal(routed.prepared.request, null);
});
