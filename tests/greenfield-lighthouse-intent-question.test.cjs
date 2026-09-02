"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupProductionUi, transactionRecords } = require('./master-input-ui-fixture.cjs');

async function expense(env, suffix, title, amountSatang, createdAt = '2026-08-28T02:00:00.000Z') {
  const result = await env.runtime.recordExpense({ workflowId:`WF-Q-${suffix}`, recordId:`TX-Q-${suffix}`, title, amountSatang, createdAt });
  assert.equal(result.commandResult.readback.readback.status, 'READBACK_VERIFIED');
}

test('P1Q01 exact durable question returns read-only truth without creating or mutating records', async () => {
  const env = await setupProductionUi('Q01');
  try {
    await expense(env, 'rice', 'ข้าว', 6500, '2026-08-28T00:20:00.000Z');
    const before = await env.runtime.readState();
    assert.equal(await env.submit('ลงข้าว65หรือยัง'), 'SUCCESS');
    assert.equal(env.document.getElementById('masterInputTitle').textContent, 'พบรายการแล้ว');
    assert.match(env.document.getElementById('masterInputMeta').textContent, /TX-Q-rice/);
    assert.equal(env.document.getElementById('masterInputActions').children.length, 0);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q02 UI highlights a question and searches durable records 10 -> 6 -> 1 without writes', async () => {
  const env = await setupProductionUi('Q02');
  try {
    const base = new Date('2026-08-28T01:00:00.000Z').getTime();
    for (let index = 0; index < 10; index += 1) {
      await expense(env, `many-${index}`, index < 6 ? 'ข้าว' : `อื่น${index}`, index === 5 ? 6500 : (1000 + index * 100), new Date(base + index * 1000).toISOString());
    }
    const before = await env.runtime.readState();
    assert.equal(await env.submit('ลงข้าว65หรือยัง'), 'SUCCESS');
    assert.equal(env.document.getElementById('masterInputQuestion').textContent, 'หรือยัง');
    const result = env.ui.getLastQueryResult();
    assert.ok(result, 'query result is exposed for truthful UI verification');
    assert.deepEqual(result.readback.steps.map(step => step.count), [10,6,1]);
    assert.equal(result.readback.record.recordId, 'TX-Q-many-5');
    assert.equal(result.readback.record.amountSatang, 6500);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q03 duplicates select newest recording time, not insertion order or business date', async () => {
  const env = await setupProductionUi('Q03');
  try {
    await expense(env, 'newer', 'ข้าว', 6500, '2026-08-28T01:00:00.000Z');
    await expense(env, 'older', 'ข้าว', 6500, '2026-08-27T01:00:00.000Z');
    const before = await env.runtime.readState();
    assert.equal(await env.submit('ลงข้าว65หรือยัง'), 'SUCCESS');
    assert.match(env.document.getElementById('masterInputMeta').textContent, /TX-Q-newer/);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});

test('P1Q04 no exact amount match reports not found rather than choosing a nearby amount', async () => {
  const env = await setupProductionUi('Q04');
  try {
    await expense(env, 'different', 'ข้าว', 6600);
    const before = await env.runtime.readState();
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
    assert.equal(await env.submit('ลงข้าว1,50หรือยัง'), 'WAITING');
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
    assert.equal(await env.submit('ไม่ต้องลงข้าว65หรือยัง'), 'UNSUPPORTED');
    assert.equal(env.providerCalls(), 0);
    assert.equal(await env.submit('ถ้าฝนตกลงข้าว65หรือยัง'), 'UNSUPPORTED');
    assert.equal(env.providerCalls(), 0);
    assert.equal(await env.submit('ลงข้าว65และค่าน้ำ50หรือยัง'), 'UNSUPPORTED');
    assert.equal(env.providerCalls(), 0);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0);
  } finally { env.cleanup(); }
});

test('P1Q07 unrepresented query units or clock time are not discarded to return a match', async () => {
  const env = await setupProductionUi('Q07');
  try {
    await expense(env, 'base', 'ข้าว', 6500);
    const before = await env.runtime.readState();
    assert.equal(await env.submit('ลงข้าว65สองถุงหรือยัง'), 'UNSUPPORTED');
    assert.equal(await env.submit('ลงข้าว65ตอนเที่ยงหรือยัง'), 'UNSUPPORTED');
    assert.equal(env.providerCalls(), 0);
    assert.deepEqual(await env.runtime.readState(), before);
  } finally { env.cleanup(); }
});
