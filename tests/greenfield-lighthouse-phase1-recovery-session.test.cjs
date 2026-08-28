"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function routeRecoveryInput(text) {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  let providerCalls = 0;
  const routed = await routeMasterInputText(text, {
    receivedAt:'2026-08-28T01:30:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:()=>'REQ-C1',
    interpretFallback:async () => { providerCalls += 1; throw new Error('PROVIDER_SHOULD_NOT_RUN'); },
  });
  assert.equal(providerCalls, 0);
  return routed;
}

async function sessionTools() {
  return import('../lighthouse/master-input-recovery-session.mjs');
}

test('P1C101 front-door RECOVERY_REQUIRED opens one session that preserves input/group/slot home and caps local work at 3 passes', async () => {
  const routed = await routeRecoveryInput('ข้าว 2 65');
  assert.equal(routed.route, 'STOP');
  assert.equal(routed.status, 'RECOVERY_REQUIRED');

  const { createRecoverySession, runSessionLocalRecovery } = await sessionTools();
  const session = createRecoverySession(routed, { inputId:'I-C1' });
  const ambiguous = Object.values(session.slots).filter(slot => slot.state === 'AMBIGUOUS');
  assert.equal(ambiguous.length, 2);
  const home = ambiguous[0];
  assert.equal(session.inputId, 'I-C1');
  assert.equal(home.groupId, 'G1');
  assert.equal(home.slotId.startsWith('G1-S'), true);

  const calls = [];
  const pass = n => value => { calls.push(n); return { resolved:false, value }; };
  const result = runSessionLocalRecovery(session, {
    slotId:home.slotId,
    passFns:[pass(1), pass(2), pass(3), pass(4)],
    queueIdFactory:()=>'Q-C1-old',
  });
  assert.deepEqual(calls, [1,2,3]);
  assert.equal(result.status, 'AI_REQUIRED');
  assert.equal(result.state.inputId, 'I-C1');
  assert.equal(result.state.slots[home.slotId].groupId, 'G1');
  assert.equal(result.state.slots[home.slotId].queueId, 'Q-C1-old');
  assert.equal(result.state.slots[home.slotId].state, 'WAITING');
});

test('P1C102 explicit owner correction invalidates the old queue so a late result cannot overwrite the corrected slot', async () => {
  const routed = await routeRecoveryInput('ข้าว 2 65');
  const { createRecoverySession, runSessionLocalRecovery, applySessionOwnerInput, applySessionResult } = await sessionTools();
  let session = createRecoverySession(routed, { inputId:'I-C2' });
  const slotId = Object.values(session.slots).find(slot => slot.state === 'AMBIGUOUS').slotId;
  session = runSessionLocalRecovery(session, {
    slotId,
    passFns:[value => ({ resolved:false, value }), value => ({ resolved:false, value }), value => ({ resolved:false, value })],
    queueIdFactory:()=>'Q-C2-old',
  }).state;

  const corrected = applySessionOwnerInput(session, 'แก้ไข 160', { selection:slotId });
  assert.equal(corrected.status, 'APPLIED');
  assert.equal(corrected.state.slots[slotId].value, '160');
  assert.equal(corrected.state.slots[slotId].queueId, null);
  assert.equal(corrected.state.slots[slotId].state, 'CORRECTED');

  const late = applySessionResult(corrected.state, { slotId, queueId:'Q-C2-old', value:'150' });
  assert.equal(late.status, 'STALE_RESULT');
  assert.equal(late.state.slots[slotId].value, '160');
});

test('P1C103 normal text during pending recovery is a new input and does not mutate the pending session', async () => {
  const routed = await routeRecoveryInput('ข้าว 2 65');
  const { createRecoverySession, runSessionLocalRecovery, applySessionOwnerInput } = await sessionTools();
  let session = createRecoverySession(routed, { inputId:'I-C3' });
  const slotId = Object.values(session.slots).find(slot => slot.state === 'AMBIGUOUS').slotId;
  session = runSessionLocalRecovery(session, {
    slotId,
    passFns:[value => ({ resolved:false, value }), value => ({ resolved:false, value }), value => ({ resolved:false, value })],
    queueIdFactory:()=>'Q-C3',
  }).state;
  const before = structuredClone(session);

  const incoming = applySessionOwnerInput(session, 'กาแฟ 45');
  assert.equal(incoming.status, 'NEW_INPUT');
  assert.equal(incoming.payload, 'กาแฟ 45');
  assert.deepEqual(incoming.state, before);
});

test('P1C104 unresolved second recovery cycle requires whole-input replacement and replacement does not invent the new input identity', async () => {
  const routed = await routeRecoveryInput('ข้าว 2 65');
  const { createRecoverySession, advanceSessionCycle, applySessionOwnerInput } = await sessionTools();
  let session = createRecoverySession(routed, { inputId:'I-C4' });

  const first = advanceSessionCycle(session, { unresolved:true });
  assert.equal(first.status, 'NEW_FLOW');
  assert.equal(first.state.cycle, 2);

  const second = advanceSessionCycle(first.state, { unresolved:true });
  assert.equal(second.status, 'REPLACE_REQUIRED');
  assert.equal(second.command, 'แทนที่');
  assert.equal(second.state.cycle, 2);
  assert.equal(second.state.status, 'REPLACE_REQUIRED');

  const replacement = applySessionOwnerInput(second.state, 'แทนที่ ข้าว65');
  assert.equal(replacement.status, 'REPLACE');
  assert.equal(replacement.payload, 'ข้าว65');
  assert.equal(replacement.state.status, 'REPLACED');
  assert.equal(replacement.state.inputId, 'I-C4');
  assert.equal(Object.hasOwn(replacement, 'newInputId'), false);
});
