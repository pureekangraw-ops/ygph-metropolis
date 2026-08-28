"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function temporal() {
  return import('../lighthouse/intent-temporal.mjs');
}

function dateOf(result) {
  return result.temporal.businessDate;
}

test('T01 เมื่อวาน anchors to receivedAt calendar date in Asia/Bangkok', async () => {
  const { resolveTemporal } = await temporal();
  const result = resolveTemporal('เมื่อวานข้าว65', {
    receivedAt:'2026-08-28T10:00:00Z',
    timeZone:'Asia/Bangkok',
  });
  assert.equal(result.status, 'RESOLVED');
  assert.equal(dateOf(result), '2026-08-27');
  assert.equal(result.temporal.anchorReceivedAt, '2026-08-28T10:00:00Z');
  assert.equal(result.temporal.timeZone, 'Asia/Bangkok');
});

test('T02 วันนี้ uses Bangkok date after UTC has not yet crossed midnight', async () => {
  const { resolveTemporal } = await temporal();
  const result = resolveTemporal('วันนี้ข้าว65', {
    receivedAt:'2026-08-27T18:00:00Z',
    timeZone:'Asia/Bangkok',
  });
  assert.equal(dateOf(result), '2026-08-28');
});

test('T03 เมื่อวาน crosses non-leap February boundary by calendar date', async () => {
  const { resolveTemporal } = await temporal();
  const result = resolveTemporal('เมื่อวานข้าว65', {
    receivedAt:'2026-03-01T00:00:00Z',
    timeZone:'Asia/Bangkok',
  });
  assert.equal(dateOf(result), '2026-02-28');
});

test('T04 เมื่อวาน preserves leap day in 2028', async () => {
  const { resolveTemporal } = await temporal();
  const result = resolveTemporal('เมื่อวานข้าว65', {
    receivedAt:'2028-03-01T00:00:00Z',
    timeZone:'Asia/Bangkok',
  });
  assert.equal(dateOf(result), '2028-02-29');
});

test('T05 interpretation after Bangkok midnight does not re-anchor a relative day', async () => {
  const { resolveTemporal } = await temporal();
  const result = resolveTemporal('เมื่อวานข้าว65', {
    receivedAt:'2026-08-28T16:59:00Z',
    interpretedAt:'2026-08-28T17:01:00Z',
    timeZone:'Asia/Bangkok',
  });
  assert.equal(dateOf(result), '2026-08-27');
  assert.equal(result.temporal.anchorReceivedAt, '2026-08-28T16:59:00Z');
});

test('T06 date-only input never invents a clock time', async () => {
  const { resolveTemporal } = await temporal();
  const result = resolveTemporal('วันที่ 28/8/2026 ข้าว65', {
    receivedAt:'2026-08-28T10:00:00Z',
    timeZone:'Asia/Bangkok',
  });
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.temporal.kind, 'DATE');
  assert.equal(result.temporal.businessDate, '2026-08-28');
  assert.equal(result.temporal.clockTime, null);
  assert.equal(result.temporal.precision, 'DATE_ONLY');
});

test('T07 temporal data cannot be stripped to fit PATH v1 when date support is absent', async () => {
  const { resolveTemporal, evaluateTemporalRoute } = await temporal();
  const temporalResult = resolveTemporal('เมื่อวานข้าว65', {
    receivedAt:'2026-08-28T10:00:00Z',
    timeZone:'Asia/Bangkok',
  });
  const gate = evaluateTemporalRoute({
    temporal:temporalResult.temporal,
    route:'PATH_V1',
    capabilities:{ businessDate:false },
  });
  assert.deepEqual(gate, {
    status:'UNSUPPORTED',
    reason:'TEMPORAL_NOT_SUPPORTED',
    route:'PATH_V1',
    temporal:temporalResult.temporal,
  });
});

test('T08 matching title and money with wrong businessDate remains VERIFY, never COMPLETE', async () => {
  const { resolveTemporal, verifyTemporalReadback } = await temporal();
  const temporalResult = resolveTemporal('เมื่อวานข้าว65', {
    receivedAt:'2026-08-28T10:00:00Z',
    timeZone:'Asia/Bangkok',
  });
  const result = verifyTemporalReadback({
    temporal:temporalResult.temporal,
    expected:{ title:'ข้าว', amountSatang:6500 },
    readback:{ title:'ข้าว', amountSatang:6500, businessDate:'2026-08-28' },
  });
  assert.deepEqual(result, {
    status:'VERIFY',
    reason:'BUSINESS_DATE_MISMATCH',
    expectedBusinessDate:'2026-08-27',
    observedBusinessDate:'2026-08-28',
  });
});
