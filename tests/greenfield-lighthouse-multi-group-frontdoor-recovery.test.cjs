"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const PASSPHRASE = 'correct horse battery staple';

function imported(record) {
  return { record, provenance:{ origin:'EVIDENCE_IMPORT' }, history:[] };
}

async function durableRuntime() {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-30T03:20:00.000Z' });
  state.domains.LEDGER.records.CURRENT = imported({
    recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:100000,
    calculation:{ openingBalanceSatang:100000 },
  });
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  const runtime = createGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => '2026-08-30T03:21:00.000Z' });
  await runtime.readState();
  return { runtime, read:() => readEncryptedState({ store, passphrase:PASSPHRASE }) };
}

async function routeMissingSecond(baseRevision) {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  return routeMasterInputText('ข้าว65ข้าว', {
    receivedAt:'2026-08-30T03:20:00.000Z',
    timeZone:'Asia/Bangkok',
    baseRevision,
    requestIdFactory:() => 'FD-RECOVERY-STABLE',
    interpretFallback:async () => { throw new Error('PROVIDER_MUST_NOT_RUN'); },
  });
}

test('FD13 missing amount is represented as a WAITING MONEY home while an independent ready box remains separate', async () => {
  const { parseIntentTask1 } = await import('../lighthouse/intent-parser.mjs');
  const parsed = parseIntentTask1('ข้าว65ข้าว');
  assert.equal(parsed.status, 'RECOVERY_REQUIRED');
  assert.equal(parsed.groups.length, 2);
  const waiting = parsed.groups[1].slots.find(slot => slot.role === 'MONEY');
  assert.equal(waiting?.state, 'WAITING');
  assert.equal(waiting?.rawSpan.start, waiting?.rawSpan.end);

  const routed = await routeMissingSecond(1);
  assert.equal(routed.route, 'LOCAL_MULTI_GROUP');
  assert.equal(routed.status, 'MIXED');
  assert.deepEqual(routed.commands.map(command => command.status), ['READY','WAITING']);
  assert.equal(typeof routed.compileId, 'string');
});

test('FD14 paused independent box resumes with the same compile identity and never re-executes an already COMPLETE sibling', async () => {
  const { executeFrontdoorMultiGroupBoxes } = await import('../lighthouse/multi-group-frontdoor-runtime.mjs');
  const {
    createFrontdoorMultiGroupRecoverySession,
    updateFrontdoorMultiGroupRecoverySession,
    rejoinFrontdoorMultiGroupRecoverySession,
  } = await import('../lighthouse/multi-group-frontdoor-recovery.mjs');
  const { applySessionOwnerInput } = await import('../lighthouse/master-input-recovery-session.mjs');
  const { runtime, read } = await durableRuntime();
  const before = await read();
  const routed = await routeMissingSecond(before.revision);

  let session = createFrontdoorMultiGroupRecoverySession(routed, {
    inputId:'FD14-I1', pauseId:'FD14-P1', baseRevision:before.revision,
  });
  assert.equal(session.status, 'WAITING');
  assert.equal(session.mode, 'MULTI_GROUP');
  assert.equal(session.compileId, routed.compileId);
  assert.equal(session.groupId, 'G2');
  assert.equal(session.uiDirective.type, 'ENTER_VALUE');

  const first = await executeFrontdoorMultiGroupBoxes(runtime, routed);
  assert.deepEqual(first.commands.map(command => command.status), ['COMPLETE','WAITING']);
  session = updateFrontdoorMultiGroupRecoverySession(session, first.commands);
  const afterFirst = await read();
  const firstExpenses = Object.values(afterFirst.domains.LEDGER.records).map(entry => entry?.record).filter(record => record?.detail === 'OUT:EXPENSE');
  assert.equal(firstExpenses.length, 1);
  assert.equal(firstExpenses[0].amountSatang, 6500);

  const correction = applySessionOwnerInput(session, '500');
  assert.equal(correction.status, 'APPLIED');
  const rejoined = await rejoinFrontdoorMultiGroupRecoverySession(correction.state, {
    currentRevision:afterFirst.revision,
    receivedAt:'2026-08-30T03:22:00.000Z',
    timeZone:'Asia/Bangkok',
  });
  assert.equal(rejoined.routed.route, 'LOCAL_MULTI_GROUP');
  assert.equal(rejoined.routed.compileId, routed.compileId);
  assert.deepEqual(rejoined.routed.commands.map(command => command.status), ['COMPLETE','READY']);
  assert.equal(rejoined.revalidation.revisionChanged, true);

  const second = await executeFrontdoorMultiGroupBoxes(runtime, rejoined.routed);
  assert.deepEqual(second.commands.map(command => command.status), ['COMPLETE','COMPLETE']);
  const finalState = await read();
  const expenses = Object.values(finalState.domains.LEDGER.records).map(entry => entry?.record).filter(record => record?.detail === 'OUT:EXPENSE');
  assert.equal(expenses.length, 2);
  assert.deepEqual(expenses.map(record => record.amountSatang).sort((a,b) => a-b), [6500,50000]);
});

test('FD15 cancel aborts the waiting home without mutating that box', async () => {
  const { createFrontdoorMultiGroupRecoverySession } = await import('../lighthouse/multi-group-frontdoor-recovery.mjs');
  const { applySessionOwnerInput } = await import('../lighthouse/master-input-recovery-session.mjs');
  const { runtime, read } = await durableRuntime();
  const before = await read();
  const routed = await routeMissingSecond(before.revision);
  const session = createFrontdoorMultiGroupRecoverySession(routed, {
    inputId:'FD15-I1', pauseId:'FD15-P1', baseRevision:before.revision,
  });
  const cancelled = applySessionOwnerInput(session, 'ยกเลิก');
  assert.equal(cancelled.status, 'ABORTED');
  assert.equal(cancelled.reason, 'ABORTED_BY_USER_INTERRUPTION');
  assert.deepEqual(await read(), before);
  runtime.close();
});
