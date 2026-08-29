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

test('P1C103 a genuinely new command aborts the old paused session before the new payload is rerouted', async () => {
  const routed = await routeRecoveryInput('ข้าว 2 65');
  const { createRecoverySession, runSessionLocalRecovery, applySessionOwnerInput } = await sessionTools();
  let session = createRecoverySession(routed, { inputId:'I-C3' });
  const slotId = Object.values(session.slots).find(slot => slot.state === 'AMBIGUOUS').slotId;
  session = runSessionLocalRecovery(session, {
    slotId,
    passFns:[value => ({ resolved:false, value }), value => ({ resolved:false, value }), value => ({ resolved:false, value })],
    queueIdFactory:()=>'Q-C3',
  }).state;

  const incoming = applySessionOwnerInput(session, 'กาแฟ 45');
  assert.equal(incoming.status, 'ABORTED');
  assert.equal(incoming.reason, 'ABORTED_BY_USER_INTERRUPTION');
  assert.equal(incoming.payload, 'กาแฟ 45');
  assert.equal(incoming.state.status, 'ABORTED');
  assert.equal(Object.values(incoming.state.slots).every(slot => slot.queueId === null), true);
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

test('P1C105 explicit cancel drops paused work without creating a fake next command', async () => {
  const session = {
    inputId:'I-C5', rawText:'ข้าว 2 65', originalRawText:'ข้าว 2 65', cycle:1, status:'RECOVERY_REQUIRED',
    slots:{ S1:{ slotId:'S1', groupId:'G1', role:'NUMBER', value:'2', queueId:'Q-C5', state:'WAITING' } },
  };
  const { applySessionOwnerInput } = await sessionTools();
  const cancelled = applySessionOwnerInput(session, 'ยกเลิก');
  assert.equal(cancelled.status, 'ABORTED');
  assert.equal(cancelled.reason, 'ABORTED_BY_USER_INTERRUPTION');
  assert.equal(cancelled.payload, null);
  assert.equal(cancelled.state.status, 'ABORTED');
  assert.equal(cancelled.state.slots.S1.queueId, null);
});

test('P1C106 a scalar reply answers the only waiting numeric slot instead of becoming a new command', async () => {
  const session = {
    inputId:'I-C6', rawText:'ข้าว ?', originalRawText:'ข้าว ?', cycle:1, status:'RECOVERY_REQUIRED',
    slots:{ S1:{ slotId:'S1', groupId:'G1', role:'NUMBER', rawSpan:{ start:4, end:5 }, value:'?', queueId:'Q-C6', state:'WAITING' } },
  };
  const { applySessionOwnerInput } = await sessionTools();
  const answered = applySessionOwnerInput(session, '160');
  assert.equal(answered.status, 'APPLIED');
  assert.deepEqual(answered.targets, ['S1']);
  assert.equal(answered.state.slots.S1.value, '160');
  assert.equal(answered.state.slots.S1.queueId, null);
  assert.equal(answered.state.slots.S1.state, 'CORRECTED');
});

test('P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI', async () => {
  const { SEMANTIC_UI_TYPES, createWaitingDirective, waitingDirectiveForSession } = await sessionTools();
  assert.deepEqual([...SEMANTIC_UI_TYPES], ['CONFIRM_TEXT','PICK_DATE','SELECT_TARGET','ENTER_VALUE','CONFIRM_ACTION']);
  assert.throws(() => createWaitingDirective('BOGUS'), /WAITING_DIRECTIVE_TYPE_INVALID/);

  const session = {
    inputId:'I-C7', rawText:'ข้าว ?', originalRawText:'ข้าว ?', cycle:1, status:'RECOVERY_REQUIRED',
    slots:{ S1:{ slotId:'S1', groupId:'G1', role:'NUMBER', value:'?', queueId:'Q-C7', state:'WAITING' } },
  };
  const directive = waitingDirectiveForSession(session);
  assert.equal(directive.status, 'WAITING');
  assert.equal(directive.type, 'ENTER_VALUE');
  assert.equal(directive.telemetryTag, 'WAIT_MISSING_PARAM');
  assert.equal(directive.slotId, 'S1');
  assert.equal(Object.hasOwn(directive, 'needsAI'), false);
});
