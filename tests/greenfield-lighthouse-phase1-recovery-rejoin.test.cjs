"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function routeRecoveryInput(text, requestId = 'REQ-C3') {
  const { routeMasterInputText } = await import('../lighthouse/master-input-route.mjs');
  let providerCalls = 0;
  const routed = await routeMasterInputText(text, {
    receivedAt:'2026-08-28T01:30:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:()=>requestId,
    interpretFallback:async () => { providerCalls += 1; throw new Error('PROVIDER_SHOULD_NOT_RUN'); },
  });
  assert.equal(providerCalls, 0);
  return routed;
}

async function sessionTools() {
  return import('../lighthouse/master-input-recovery-session.mjs');
}

test('P1C301 owner correction reassembles only the original slot span while preserving input identity and original raw text', async () => {
  const routed = await routeRecoveryInput('ข้าว 1,50');
  const { createRecoverySession, applySessionOwnerInput, reassembleRecoverySession } = await sessionTools();
  const session = createRecoverySession(routed, { inputId:'I-C301' });
  const corrected = applySessionOwnerInput(session, 'แก้ไข 150');
  assert.equal(corrected.status, 'APPLIED');

  const reassembled = reassembleRecoverySession(corrected.state);
  assert.equal(reassembled.inputId, 'I-C301');
  assert.equal(reassembled.originalRawText, 'ข้าว 1,50');
  assert.equal(reassembled.text, 'ข้าว 150');
  assert.equal(corrected.state.rawText, 'ข้าว 1,50');
});

test('P1C302 corrected recovery rejoins the existing local Intent -> PATH flow as READY without executing', async () => {
  const routed = await routeRecoveryInput('ข้าว 1,50');
  const { createRecoverySession, applySessionOwnerInput, rejoinRecoverySession } = await sessionTools();
  const session = createRecoverySession(routed, { inputId:'I-C302' });
  const corrected = applySessionOwnerInput(session, 'แก้ไข 150');

  const rejoined = await rejoinRecoverySession(corrected.state, {
    receivedAt:'2026-08-28T01:30:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:()=>'REQ-C302',
  });
  assert.equal(rejoined.inputId, 'I-C302');
  assert.equal(rejoined.text, 'ข้าว 150');
  assert.equal(rejoined.routed.route, 'LOCAL_PATH');
  assert.equal(rejoined.routed.status, 'READY');
  assert.equal(rejoined.routed.prepared.request.fields.title, 'ข้าว');
  assert.equal(rejoined.routed.prepared.request.fields.amountSatang, 15000);
  assert.equal(Object.hasOwn(rejoined, 'execution'), false);
  assert.equal(Object.hasOwn(rejoined, 'readback'), false);
});

test('P1C303 unresolved correction refreshes the same recovery home so a second correction can complete the flow', async () => {
  const routed = await routeRecoveryInput('ข้าว 1,50');
  const { createRecoverySession, applySessionOwnerInput, rejoinRecoverySession } = await sessionTools();
  const session = createRecoverySession(routed, { inputId:'I-C303' });

  const firstCorrection = applySessionOwnerInput(session, 'แก้ไข 1,60');
  assert.equal(firstCorrection.status, 'APPLIED');
  const firstRejoin = await rejoinRecoverySession(firstCorrection.state, {
    receivedAt:'2026-08-28T01:30:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:()=>'REQ-C303-A',
  });
  assert.equal(firstRejoin.inputId, 'I-C303');
  assert.equal(firstRejoin.text, 'ข้าว 1,60');
  assert.equal(firstRejoin.routed.status, 'RECOVERY_REQUIRED');
  assert.equal(firstRejoin.recoverySession.inputId, 'I-C303');
  assert.equal(firstRejoin.recoverySession.originalRawText, 'ข้าว 1,50');

  const secondCorrection = applySessionOwnerInput(firstRejoin.recoverySession, 'แก้ไข 160');
  assert.equal(secondCorrection.status, 'APPLIED');
  const secondRejoin = await rejoinRecoverySession(secondCorrection.state, {
    receivedAt:'2026-08-28T01:30:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:()=>'REQ-C303-B',
  });
  assert.equal(secondRejoin.inputId, 'I-C303');
  assert.equal(secondRejoin.text, 'ข้าว 160');
  assert.equal(secondRejoin.routed.route, 'LOCAL_PATH');
  assert.equal(secondRejoin.routed.status, 'READY');
  assert.equal(secondRejoin.routed.prepared.request.fields.amountSatang, 16000);
});

test('P1C304 unresolved rejoin refreshes the exact session object held by production UI before the next correction', async () => {
  const ui = fs.readFileSync('ui/master-input.mjs', 'utf8');
  assert.match(ui, /activeRecoverySession\s*=\s*recoveryInput\.state/);
  assert.match(ui, /rejoinRecoverySession\(recoveryInput\.state/);

  const routed = await routeRecoveryInput('ข้าว 1,50', 'REQ-C304');
  const { createRecoverySession, applySessionOwnerInput, rejoinRecoverySession } = await sessionTools();
  const session = createRecoverySession(routed, { inputId:'I-C304' });
  const corrected = applySessionOwnerInput(session, 'แก้ไข 1,60');
  const heldByProductionUi = corrected.state;
  assert.equal(Object.values(heldByProductionUi.slots).some(slot => slot.state === 'CORRECTED'), true);

  const rejoined = await rejoinRecoverySession(heldByProductionUi, {
    receivedAt:'2026-08-28T01:30:00.000Z',
    timeZone:'Asia/Bangkok',
    requestIdFactory:()=>'REQ-C304-R',
  });
  assert.equal(rejoined.routed.status, 'RECOVERY_REQUIRED');
  assert.equal(rejoined.recoverySession, heldByProductionUi);
  assert.equal(Object.values(heldByProductionUi.slots).some(slot => slot.state === 'INVALID' || slot.state === 'AMBIGUOUS' || slot.state === 'WAITING'), true);

  const nextCorrection = applySessionOwnerInput(heldByProductionUi, 'แก้ไข 160');
  assert.equal(nextCorrection.status, 'APPLIED');
});
