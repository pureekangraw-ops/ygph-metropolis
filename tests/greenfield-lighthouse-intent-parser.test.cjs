"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function parse(text) {
  const { parseIntentTask1 } = await import('../lighthouse/intent-parser.mjs');
  return parseIntentTask1(text);
}

function slot(group, role) {
  return group.slots.find(item => item.role === role) || null;
}

function slots(group, role) {
  return group.slots.filter(item => item.role === role);
}

function assertHomes(result) {
  for (const group of result.groups) {
    assert.equal(result.rawText.slice(group.rawSpan.start, group.rawSpan.end), group.rawText);
    for (const item of group.slots) {
      assert.equal(result.rawText.slice(item.rawSpan.start, item.rawSpan.end), item.rawValue);
    }
  }
}

test('S01 ข้าว 65 is one group with 6500 satang', async () => {
  const result = await parse('ข้าว 65');
  assert.equal(result.status, 'PARSED');
  assert.equal(result.groups.length, 1);
  assert.equal(slot(result.groups[0], 'TARGET').rawValue, 'ข้าว');
  assert.equal(slot(result.groups[0], 'MONEY').resolvedValue.amountSatang, 6500);
  assertHomes(result);
});

test('S02 ข้าว65น้ำมัน500 stays in two non-crossed homes', async () => {
  const result = await parse('ข้าว65น้ำมัน500');
  assert.equal(result.status, 'PARSED');
  assert.deepEqual(result.groups.map(group => group.rawText), ['ข้าว65', 'น้ำมัน500']);
  assert.deepEqual(result.groups.map(group => slot(group, 'MONEY').resolvedValue.amountSatang), [6500, 50000]);
  assertHomes(result);
});

test('S03 prohibition stays with first group while second group remains active', async () => {
  const result = await parse('ไม่ต้องลงข้าว65 แต่ลงน้ำมัน500');
  assert.equal(result.status, 'PARSED');
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].prohibited, true);
  assert.equal(result.groups[1].prohibited, false);
  assert.equal(slot(result.groups[0], 'MONEY').resolvedValue.amountSatang, 6500);
  assert.equal(slot(result.groups[1], 'MONEY').resolvedValue.amountSatang, 50000);
  assertHomes(result);
});

test('S04 connector word alone does not split น้ำกับข้าว 65', async () => {
  const result = await parse('น้ำกับข้าว 65');
  assert.equal(result.status, 'PARSED');
  assert.equal(result.groups.length, 1);
  assert.equal(slot(result.groups[0], 'TARGET').rawValue, 'น้ำกับข้าว');
  assert.equal(slot(result.groups[0], 'MONEY').resolvedValue.amountSatang, 6500);
});

test('S05 Thai number words become money instead of part of the title', async () => {
  const result = await parse('ข้าวหกสิบห้า');
  assert.equal(result.status, 'PARSED');
  assert.equal(slot(result.groups[0], 'TARGET').rawValue, 'ข้าว');
  const money = slot(result.groups[0], 'MONEY');
  assert.equal(money.rawValue, 'หกสิบห้า');
  assert.equal(money.resolvedValue.amountSatang, 6500);
});

test('S06 Thai digits with two decimals preserve raw text and resolve satang exactly', async () => {
  const result = await parse('ข้าว ๖๕.๕๐');
  const money = slot(result.groups[0], 'MONEY');
  assert.equal(money.rawValue, '๖๕.๕๐');
  assert.equal(money.resolvedValue.amountSatang, 6550);
  assertHomes(result);
});

test('S07 valid thousands comma resolves exactly', async () => {
  const result = await parse('ข้าว 1,500');
  assert.equal(slot(result.groups[0], 'MONEY').resolvedValue.amountSatang, 150000);
});

test('S08 malformed comma requires recovery and is not coerced', async () => {
  const result = await parse('ข้าว 1,50');
  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(slot(result.groups[0], 'MONEY'), null);
  const invalid = slots(result.groups[0], 'NUMBER').find(item => item.state === 'INVALID');
  assert.equal(invalid.rawValue, '1,50');
  assert.equal(invalid.resolvedValue, null);
});

test('S09 quantity and money are separate slots', async () => {
  const result = await parse('ข้าว 2 กล่อง 65 บาท');
  assert.equal(result.status, 'PARSED');
  const quantity = slot(result.groups[0], 'QUANTITY');
  const money = slot(result.groups[0], 'MONEY');
  assert.deepEqual(quantity.resolvedValue, { value:2, unit:'กล่อง' });
  assert.deepEqual(money.resolvedValue, { value:65, unit:'บาท', amountSatang:6500 });
});

test('S10 two unlabelled numbers remain ambiguous', async () => {
  const result = await parse('ข้าว 2 65');
  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(slot(result.groups[0], 'MONEY'), null);
  const ambiguous = slots(result.groups[0], 'NUMBER');
  assert.equal(ambiguous.length, 2);
  assert.ok(ambiguous.every(item => item.state === 'AMBIGUOUS'));
});

test('S11 money with more than two decimals is invalid and never rounded', async () => {
  const result = await parse('ข้าว 65.555');
  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(slot(result.groups[0], 'MONEY'), null);
  const invalid = slots(result.groups[0], 'NUMBER').find(item => item.state === 'INVALID');
  assert.equal(invalid.rawValue, '65.555');
});

test('S12 quoted command text inside a meaning question is reference-only', async () => {
  const result = await parse('คำว่า “ข้าว 65” หมายถึงอะไร');
  assert.equal(result.status, 'REFERENCE');
  assert.deepEqual(result.groups, []);
});
