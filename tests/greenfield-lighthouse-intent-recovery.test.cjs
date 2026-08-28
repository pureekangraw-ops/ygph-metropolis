"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function recovery() {
  return import('../lighthouse/intent-recovery.mjs');
}

test('R01 known error form resolves directly to its single verified parent without AI', async () => {
  const { resolveKnownErrorForm } = await recovery();
  const history = { 'รายจ่าย': { 'รากยจาาย': 2 } };
  assert.deepEqual(resolveKnownErrorForm(history, 'รากยจาาย'), {
    status:'RESOLVED', correct:'รายจ่าย', candidates:['รายจ่าย'], needsAI:false,
  });
});

test('R02 one error form pointing to two valid parents stays ambiguous regardless of frequency', async () => {
  const { resolveKnownErrorForm } = await recovery();
  const history = { 'รายจ่าย': { 'รากยจาาย': 9 }, 'รายรับ': { 'รากยจาาย': 1 } };
  assert.deepEqual(resolveKnownErrorForm(history, 'รากยจาาย'), {
    status:'AMBIGUOUS', correct:null, candidates:['รายจ่าย','รายรับ'], needsAI:false,
  });
});

test('R03 local recovery stops immediately when pass 1 resolves', async () => {
  const { runLocalRecovery } = await recovery();
  const calls = [];
  const result = runLocalRecovery('รากยจาาย', [
    value => { calls.push(1); return { resolved:true, value:'รายจ่าย' }; },
    value => { calls.push(2); return { resolved:true, value }; },
    value => { calls.push(3); return { resolved:true, value }; },
  ]);
  assert.deepEqual(calls, [1]);
  assert.deepEqual(result, { status:'RESOLVED', value:'รายจ่าย', localPasses:1 });
});

test('R04 unresolved local recovery runs at most 3 passes then requires AI, never pass 4', async () => {
  const { runLocalRecovery } = await recovery();
  const calls = [];
  const pass = n => value => { calls.push(n); return { resolved:false, value }; };
  const result = runLocalRecovery('???', [pass(1), pass(2), pass(3), pass(4)]);
  assert.deepEqual(calls, [1,2,3]);
  assert.deepEqual(result, { status:'AI_REQUIRED', value:'???', localPasses:3 });
});

test('R05 owner correction invalidates the old queue so late AI result cannot overwrite 160 with 150', async () => {
  const { applyOwnerCorrection, applySlotResult } = await recovery();
  const original = {
    inputId:'I1',
    slots:{ S1:{ slotId:'S1', value:'?', queueId:'Q-old', state:'WAITING' } },
  };
  const corrected = applyOwnerCorrection(original, {
    candidateSlotIds:['S1'], payload:'160', selection:'S1',
  });
  assert.equal(corrected.status, 'APPLIED');
  assert.equal(corrected.state.slots.S1.value, '160');
  assert.equal(corrected.state.slots.S1.queueId, null);
  const late = applySlotResult(corrected.state, { slotId:'S1', queueId:'Q-old', value:'150' });
  assert.equal(late.status, 'STALE_RESULT');
  assert.equal(late.state.slots.S1.value, '160');
});

test('R06 out-of-order slot results return to original slot identity, not completion order', async () => {
  const { applySlotResult } = await recovery();
  let state = {
    inputId:'I1',
    slots:{
      S1:{ slotId:'S1', value:null, queueId:'Q1', state:'WAITING' },
      S3:{ slotId:'S3', value:null, queueId:'Q3', state:'WAITING' },
    },
  };
  state = applySlotResult(state, { slotId:'S3', queueId:'Q3', value:'สาม' }).state;
  state = applySlotResult(state, { slotId:'S1', queueId:'Q1', value:'หนึ่ง' }).state;
  assert.equal(state.slots.S1.value, 'หนึ่ง');
  assert.equal(state.slots.S3.value, 'สาม');
});

test('R07 after the second unresolved recovery cycle the system requires whole-input replacement, not cycle 3', async () => {
  const { nextRecoveryCycle } = await recovery();
  assert.deepEqual(nextRecoveryCycle({ cycle:1, unresolved:true }), { status:'NEW_FLOW', cycle:2 });
  assert.deepEqual(nextRecoveryCycle({ cycle:2, unresolved:true }), { status:'REPLACE_REQUIRED', cycle:2, command:'แทนที่' });
});

test('R08 multiple correction targets require selection and ทั้งหมด is scoped to shown candidates only', async () => {
  const { chooseCorrectionTargets } = await recovery();
  const shown = ['S2','S5'];
  assert.deepEqual(chooseCorrectionTargets(shown, null), { status:'SELECTION_REQUIRED', targets:[] });
  assert.deepEqual(chooseCorrectionTargets(shown, 'ทั้งหมด'), { status:'SELECTED', targets:['S2','S5'] });
  assert.deepEqual(chooseCorrectionTargets(shown, 'S5'), { status:'SELECTED', targets:['S5'] });
  assert.deepEqual(chooseCorrectionTargets(shown, 'S9'), { status:'NO_MATCH', targets:[] });
});

test('R09 normal text during pending recovery remains a new input unless explicit correction command is used', async () => {
  const { classifyIncomingInput } = await recovery();
  assert.deepEqual(classifyIncomingInput('กาแฟ 45', { pendingRecovery:true }), { type:'NEW_INPUT', payload:'กาแฟ 45' });
  assert.deepEqual(classifyIncomingInput('แก้ไข 160', { pendingRecovery:true }), { type:'CORRECTION', payload:'160' });
  assert.deepEqual(classifyIncomingInput('แทนที่ กาแฟ 45', { pendingRecovery:true }), { type:'REPLACE', payload:'กาแฟ 45' });
});

test('R10 only verified AI/BIG recovery word corrections are learned under the correct parent; direct edits and numbers are excluded', async () => {
  const { recordVerifiedCorrection } = await recovery();
  let history = {};
  history = recordVerifiedCorrection(history, { wrong:'รากยจาาย', correct:'รายจ่าย', source:'AI_RECOVERY', kind:'WORD', verified:true });
  history = recordVerifiedCorrection(history, { wrong:'รากยจาาย', correct:'รายจ่าย', source:'BIG_RECOVERY', kind:'WORD', verified:true });
  history = recordVerifiedCorrection(history, { wrong:'ราจ่าย', correct:'รายจ่าย', source:'DIRECT_EDIT', kind:'WORD', verified:true });
  history = recordVerifiedCorrection(history, { wrong:'150', correct:'160', source:'BIG_RECOVERY', kind:'NUMBER', verified:true });
  history = recordVerifiedCorrection(history, { wrong:'รายจาาย', correct:'รายจ่าย', source:'AI_RECOVERY', kind:'WORD', verified:false });
  assert.deepEqual(history, { 'รายจ่าย': { 'รากยจาาย': 2 } });
});
