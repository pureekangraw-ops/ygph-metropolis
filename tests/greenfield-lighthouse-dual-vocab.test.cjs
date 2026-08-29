const test = require('node:test');
const assert = require('node:assert/strict');

async function loadDual() {
  return import('../lighthouse/intent-dual-route.mjs').catch(error => ({ __loadError:error }));
}

async function loadInterpret() {
  return import('../lighthouse/intent-interpret.mjs').catch(error => ({ __loadError:error }));
}

async function loadRecovery() {
  return import('../lighthouse/intent-recovery.mjs');
}

async function decide(text) {
  const mod = await loadDual();
  assert.equal(typeof mod.decideInputRoute, 'function', `dual route module unavailable: ${mod.__loadError?.message ?? 'missing export'}`);
  return mod.decideInputRoute(text);
}

async function interpret(text) {
  const mod = await loadInterpret();
  assert.equal(typeof mod.interpretIntentInput, 'function', `interpret module unavailable: ${mod.__loadError?.message ?? 'missing export'}`);
  return mod.interpretIntentInput(text);
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
  const routed = await decide('วันที่15 มีนัด ช่วยลงปติธินให้หน่อย');
  assert.equal(routed.route, 'INTERPRET');
  const result = await interpret('วันที่15 มีนัด ช่วยลงปติธินให้หน่อย');
  const calendar = result.tokens.find(token => token.canonical === 'ปฏิทิน');
  const date = result.tokens.find(token => token.role === 'TEMPORAL');
  assert.equal(calendar.raw, 'ปติธิน');
  assert.equal(calendar.state, 'CORRECTED_KNOWN_FORM');
  assert.equal(date.raw, 'วันที่15');
  assert.equal(result.tokens.some(token => token.role === 'MONEY' && token.raw.includes('15')), false);
  assert.equal(result.capability, 'NOT_CONNECTED');
  assert.equal(result.request, null);
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

test('D08 unknown names and pending appointment text survive intact', async () => {
  const person = await interpret('สมชาย');
  assert.equal(person.pending.map(item => item.raw).join(''), 'สมชาย');
  const appointment = await interpret('มีนัดหมอ');
  assert.equal(appointment.pending.map(item => item.raw).join(''), 'มีนัดหมอ');
  assert.equal(appointment.tokens.map(item => item.raw).join(''), 'มีนัดหมอ');
});

test('D09 ambiguous correct Thai is not globally rewritten to a known target', async () => {
  const result = await interpret('นำมันไปเก็บ');
  assert.equal(result.tokens.some(token => token.canonical === 'น้ำมัน'), false);
  assert.equal(result.pending.map(item => item.raw).join(''), 'นำมันไปเก็บ');
});

test('D10 optional pronoun handling does not delete ownership meaning', async () => {
  const subject = await interpret('ฉันขอลงนัดหมอ');
  assert.equal(subject.omittable.some(item => item.raw === 'ฉัน'), true);
  const owner = await interpret('นัดของฉัน');
  assert.equal(owner.omittable.some(item => item.raw === 'ฉัน'), false);
  assert.equal(owner.omittable.some(item => item.raw === 'ขอ'), false);
  assert.equal(owner.tokens.map(item => item.raw).join(''), 'นัดของฉัน');
});

test('D11 stale AI result cannot overwrite corrected slot or another group', async () => {
  const { applyOwnerCorrection, applySlotResult } = await loadRecovery();
  const initial = {
    slots:{
      'G1-S1':{ value:'เก่า', queueId:'Q-1', state:'PENDING' },
      'G2-S1':{ value:'อีกชุด', queueId:'Q-2', state:'PENDING' },
    },
  };
  const corrected = applyOwnerCorrection(initial, { candidateSlotIds:['G1-S1'], selection:'G1-S1', payload:'แก้ใหม่' });
  const stale = applySlotResult(corrected.state, { slotId:'G1-S1', queueId:'Q-1', value:'ผลเก่า' });
  assert.equal(stale.status, 'STALE_RESULT');
  assert.equal(stale.state.slots['G1-S1'].value, 'แก้ใหม่');
  assert.equal(stale.state.slots['G2-S1'].value, 'อีกชุด');
});

test('D12 local recovery is bounded and unresolved cycle reaches replace stop', async () => {
  const { runLocalRecovery, nextRecoveryCycle } = await loadRecovery();
  let calls = 0;
  const unresolvedPass = value => { calls += 1; return { resolved:false, value }; };
  const local = runLocalRecovery('x', [unresolvedPass, unresolvedPass, unresolvedPass, unresolvedPass, unresolvedPass]);
  assert.equal(local.status, 'AI_REQUIRED');
  assert.equal(local.localPasses, 3);
  assert.equal(calls, 3);
  assert.deepEqual(nextRecoveryCycle({ cycle:1, unresolved:true }), { status:'NEW_FLOW', cycle:2 });
  assert.deepEqual(nextRecoveryCycle({ cycle:2, unresolved:true }), { status:'REPLACE_REQUIRED', cycle:2, command:'แทนที่' });
});

test('D13 query marker survives interpretation and cannot become CREATE', async () => {
  const routed = await decide('ลงข้าว65หรือยัง');
  assert.equal(routed.route, 'INTERPRET');
  const result = await interpret('ลงข้าว65หรือยัง');
  assert.equal(result.intent, 'QUERY');
  assert.equal(result.action, 'QUERY');
  assert.equal(result.request, null);
});

test('D14 learning accepts only verified recovery word corrections', async () => {
  const { recordVerifiedCorrection } = await loadRecovery();
  const learned = recordVerifiedCorrection({}, { verified:true, kind:'WORD', source:'AI_RECOVERY', wrong:'ปติธิน', correct:'ปฏิทิน' });
  assert.equal(learned['ปฏิทิน']['ปติธิน'], 1);
  const direct = recordVerifiedCorrection(learned, { verified:true, kind:'WORD', source:'DIRECT_EDIT', wrong:'ปติทิน', correct:'ปฏิทิน' });
  assert.equal(direct['ปฏิทิน']['ปติทิน'], undefined);
  const number = recordVerifiedCorrection(direct, { verified:true, kind:'NUMBER', source:'AI_RECOVERY', wrong:'1,50', correct:'150' });
  assert.equal(number['150'], undefined);
});

test('D15 reordered command keeps semantics but question/prohibition/condition change it', async () => {
  const a = await interpret('ลงข้าว65');
  const b = await interpret('ข้าว65ลง');
  assert.equal(a.semanticKey, b.semanticKey);
  const q = await interpret('ลงข้าว65หรือยัง');
  const p = await interpret('ไม่ต้องลงข้าว65');
  const c = await interpret('ถ้าฝนตกลงข้าว65');
  assert.notEqual(q.semanticKey, a.semanticKey);
  assert.notEqual(p.semanticKey, a.semanticKey);
  assert.notEqual(c.semanticKey, a.semanticKey);
});
