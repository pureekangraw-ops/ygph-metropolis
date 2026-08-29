const test = require('node:test');
const assert = require('node:assert/strict');

async function loadDual() {
  return import('../lighthouse/intent-dual-route.mjs').catch(error => ({ __loadError:error }));
}

async function decide(text) {
  const mod = await loadDual();
  assert.equal(typeof mod.decideInputRoute, 'function', `dual route module unavailable: ${mod.__loadError?.message ?? 'missing export'}`);
  return mod.decideInputRoute(text);
}

test('D01 one clear command keeps the old direct path', async () => {
  const result = await decide('ลงข้าว65');
  assert.equal(result.route, 'DIRECT');
  assert.equal(result.reason, 'SINGLE_CLEAR');
  assert.equal(result.parsed.groups.length, 1);
});

test('D02 two command groups select interpretation path and keep amounts in their homes', async () => {
  const result = await decide('ลงข้าว65 แล้วลงน้ำมัน500');
  assert.equal(result.route, 'INTERPRET');
  assert.equal(result.reason, 'MULTI_GROUP');
  assert.equal(result.parsed.groups.length, 2);
  assert.equal(result.parsed.groups[0].slots.find(slot => slot.role === 'MONEY').resolvedValue.amountSatang, 6500);
  assert.equal(result.parsed.groups[1].slots.find(slot => slot.role === 'MONEY').resolvedValue.amountSatang, 50000);
});

test('D03 one malformed amount selects interpretation/recovery without guessing', async () => {
  const result = await decide('ข้าว1,50');
  assert.equal(result.route, 'INTERPRET');
  assert.equal(result.reason, 'UNCLEAR');
  assert.equal(result.parsed.status, 'RECOVERY_REQUIRED');
});

test('D04 polite length does not force interpretation when the same one command remains clear', async () => {
  const result = await decide('ช่วยลงข้าว65ให้หน่อยครับ');
  assert.equal(result.route, 'DIRECT');
  assert.equal(result.reason, 'SINGLE_CLEAR');
  assert.equal(result.normalizedForProbe, 'ลงข้าว65');
});

test('D05 calendar typo stays on interpretation path and date number is not treated as direct expense', async () => {
  const result = await decide('วันที่15 มีนัด ช่วยลงปติธินให้หน่อย');
  assert.equal(result.route, 'INTERPRET');
  assert.notEqual(result.reason, 'SINGLE_CLEAR');
});

test('D06 prohibition belongs only to first group and multi-group never enters direct path', async () => {
  const result = await decide('ไม่ต้องลงข้าว65 แต่ลงน้ำมัน500');
  assert.equal(result.route, 'INTERPRET');
  assert.equal(result.reason, 'MULTI_GROUP');
  assert.equal(result.parsed.groups.length, 2);
  assert.equal(result.parsed.groups[0].prohibited, true);
  assert.equal(result.parsed.groups[1].prohibited, false);
});

test('D07 connector word alone is not a group boundary and unclear target selects interpretation', async () => {
  const result = await decide('น้ำกับข้าว65');
  assert.equal(result.route, 'INTERPRET');
  assert.equal(result.parsed.groups.length, 1);
  assert.equal(result.reason, 'UNCLEAR');
});
