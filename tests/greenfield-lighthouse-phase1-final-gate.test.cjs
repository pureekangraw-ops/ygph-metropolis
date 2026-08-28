"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupProductionUi, transactionRecords } = require('./master-input-ui-fixture.cjs');

test('P1F01 production Master Input walks local Direct intent through explicit execute to real durable LEDGER readback', async () => {
  const env = await setupProductionUi('F01');
  try {
    assert.equal(await env.submit('ข้าว65'), 'READY');
    assert.equal(env.providerCalls(), 0);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0, 'READY must not write before explicit execute');

    assert.equal(await env.execute(), 'SUCCESS');
    const records = transactionRecords(await env.runtime.readState());
    assert.equal(records.length, 1);
    assert.equal(records[0].detail, 'OUT:EXPENSE');
    assert.equal(records[0].title, 'ข้าว');
    assert.equal(records[0].amountSatang, 6500);
    assert.equal(env.document.getElementById('masterInputTitle').textContent, 'บันทึกและอ่านกลับแล้ว');
  } finally { env.cleanup(); }
});

test('P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth', async () => {
  const env = await setupProductionUi('F02');
  try {
    assert.equal(await env.submit('ข้าว 1,50'), 'ASK');
    assert.equal(env.document.getElementById('masterInputTitle').textContent, 'ขอแก้เฉพาะจุด');

    assert.equal(await env.submit('แก้ไข 1,60'), 'ASK');
    assert.equal(env.document.getElementById('masterInputTitle').textContent, 'แก้แล้วแต่ยังมีจุดไม่ชัด');

    assert.equal(await env.submit('แก้ไข 160'), 'READY');
    assert.equal(env.providerCalls(), 0);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0, 'recovery rejoin must still wait for explicit execute');

    assert.equal(await env.execute(), 'SUCCESS');
    const records = transactionRecords(await env.runtime.readState());
    assert.equal(records.length, 1);
    assert.equal(records[0].title, 'ข้าว');
    assert.equal(records[0].amountSatang, 16000);
  } finally { env.cleanup(); }
});

test('P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime', async () => {
  const env = await setupProductionUi('F03');
  try {
    assert.equal(await env.submit('ไม่ต้องลงข้าว65'), 'UNSUPPORTED');
    assert.equal(env.document.getElementById('masterInputTitle').textContent, 'ไม่ส่งทำงาน');
    assert.equal(env.providerCalls(), 0);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0);

    assert.equal(await env.submit('ถ้าฝนตกค่อยลงข้าว65'), 'UNSUPPORTED');
    assert.equal(env.document.getElementById('masterInputTitle').textContent, 'ยังไม่รองรับ');
    assert.equal(env.providerCalls(), 0);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0);
    assert.equal(env.document.getElementById('masterInputActions').children.length, 0);
  } finally { env.cleanup(); }
});

test('P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute', async () => {
  const env = await setupProductionUi('F04');
  try {
    assert.equal(await env.submit('ข้าว 1,50'), 'ASK');
    assert.equal(await env.submit('แทนที่ ข้าว65'), 'READY');
    assert.equal(env.document.getElementById('masterInputText').value, 'ข้าว65');
    assert.equal(env.providerCalls(), 0);
    assert.equal(transactionRecords(await env.runtime.readState()).length, 0);

    assert.equal(await env.execute(), 'SUCCESS');
    const records = transactionRecords(await env.runtime.readState());
    assert.equal(records.length, 1);
    assert.equal(records[0].amountSatang, 6500);
  } finally { env.cleanup(); }
});
