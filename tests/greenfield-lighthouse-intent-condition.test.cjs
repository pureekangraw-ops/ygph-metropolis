"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

const C01_TEXT = 'ถ้าพรุ่งนี้ฝนตกค่อยลงค่าแท็กซี่200';

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE',
    formatVersion:3,
    evidenceSchemaVersion:'3.1',
    packageId:'FLOW-C06-READBACK-PROOF',
    packageMode:'SNAPSHOT_AND_DELTA',
    snapshotAsOf:'2026-08-28T01:00:00.000Z',
    sourceRevision:1,
    reconciliation:{ status:'PASS', blockingIssues:[] },
    events:[
      {
        eventId:'C06-L0',
        source:'LEDGER',
        owner:'LEDGER',
        payload:{ record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:50000, calculation:{ openingBalanceSatang:50000 } } },
        validation:{ ownerConfirmation:'UNCONFIRMED' },
      },
    ],
  });
}

async function initializedRuntime() {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const runtime = createGreenfieldRuntime({
    store:createMemoryVaultStore(),
    passphrase:'correct horse battery staple',
    lockManager:null,
    now:()=>'2026-08-28T01:30:00.000Z',
  });
  const initial = await runtime.initializeFromEvidence(minimalEvidence(), {
    expectedPackageId:'FLOW-C06-READBACK-PROOF',
    expectedRevision:1,
  });
  assert.equal(initial.status, 'IMPORTED_VERIFIED');
  return runtime;
}

test('C01 condition and temporal meaning stay with the command group but unsupported condition does not execute', async () => {
  const parser = await import('../lighthouse/intent-parser.mjs');
  const { resolveTemporal } = await import('../lighthouse/intent-temporal.mjs');

  const parsed = parser.parseIntentTask1(C01_TEXT);
  assert.equal(parsed.groups.length, 1);
  const group = parsed.groups[0];
  assert.equal(group.condition?.state, 'RESOLVED');
  assert.equal(group.condition?.groupId, group.groupId);
  assert.equal(group.condition?.rawText, 'ถ้าพรุ่งนี้ฝนตกค่อย');
  assert.equal(group.condition?.meaning?.kind, 'RAIN');
  assert.equal(group.condition?.meaning?.temporalRaw, 'พรุ่งนี้');
  assert.equal(C01_TEXT.slice(group.condition.rawSpan.start, group.condition.rawSpan.end), group.condition.rawText);
  assert.equal(group.slots.find(slot => slot.role === 'TARGET')?.resolvedValue, 'ค่าแท็กซี่');
  assert.equal(group.slots.find(slot => slot.role === 'MONEY')?.resolvedValue?.amountSatang, 20000);

  const temporal = resolveTemporal(C01_TEXT, {
    receivedAt:'2026-08-28T05:00:00.000Z',
    timeZone:'Asia/Bangkok',
  });
  assert.equal(temporal.status, 'RESOLVED');
  assert.equal(temporal.temporal.businessDate, '2026-08-29');

  assert.equal(typeof parser.evaluateConditionRoute, 'function');
  const route = parser.evaluateConditionRoute({ condition:group.condition, capabilities:{} });
  assert.equal(route.status, 'UNSUPPORTED');
  assert.equal(route.reason, 'CONDITION_NOT_SUPPORTED');
  assert.deepEqual(route.condition, group.condition);
});

test('C02 AI conditionSatisfied claim cannot create execution authority', async () => {
  const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');
  assert.throws(() => gateIntentProposal({
    action:'CREATE',
    object:'EXPENSE',
    fields:{ title:'แท็กซี่', amountBaht:200, paymentMode:null, note:null },
    conditionSatisfied:true,
  }), /INVALID_INTENT_PROPOSAL/);
});

test('C03 unknown ถ้า…ค่อย… scope requires focused recovery before routing', async () => {
  const parser = await import('../lighthouse/intent-parser.mjs');
  assert.equal(typeof parser.evaluateConditionRoute, 'function');
  const condition = Object.freeze({
    state:'SCOPE_UNKNOWN',
    groupId:null,
    rawText:'ถ้า…ค่อย…',
    rawSpan:null,
    meaning:null,
  });
  const result = parser.evaluateConditionRoute({ condition, capabilities:{} });
  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(result.reason, 'CONDITION_SCOPE_UNKNOWN');
  assert.deepEqual(result.condition, condition);
});

test('C04 quoted condition meaning question remains reference-only and creates no condition task', async () => {
  const { parseIntentTask1 } = await import('../lighthouse/intent-parser.mjs');
  const parsed = parseIntentTask1('คำว่า “ถ้าฝนตก” หมายถึงอะไร');
  assert.equal(parsed.status, 'REFERENCE');
  assert.deepEqual(parsed.groups, []);
});

test('C05 understood but unsupported condition keeps understood meaning instead of becoming UNKNOWN', async () => {
  const parser = await import('../lighthouse/intent-parser.mjs');
  const parsed = parser.parseIntentTask1('ถ้าฝนตกค่อยลงค่าแท็กซี่200');
  const condition = parsed.groups[0]?.condition;
  assert.equal(condition?.state, 'RESOLVED');
  assert.equal(typeof parser.evaluateConditionRoute, 'function');
  const result = parser.evaluateConditionRoute({ condition, capabilities:{ conditionEvaluator:false } });
  assert.equal(result.status, 'UNSUPPORTED');
  assert.notEqual(result.status, 'UNKNOWN');
  assert.deepEqual(result.condition, condition);
});

test('C06 expense without a title becomes รายจ่ายทั่วไป and survives real durable LEDGER readback', async () => {
  const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');
  const { prepareMasterExecution, executePreparedMasterIntent } = await import('../greenfield/master-input-router.mjs');

  const gated = gateIntentProposal({
    action:'CREATE', object:'EXPENSE',
    fields:{ title:null, amountBaht:150, paymentMode:null, note:null },
  });
  assert.equal(gated.status, 'READY');
  assert.equal(gated.fields.title, null);

  const runtime = await initializedRuntime();
  const prepared = prepareMasterExecution(gated, {
    projection:runtime.project(),
    idFactory:prefix => `${prefix}-C06`,
  });
  assert.equal(prepared.input.title, 'รายจ่ายทั่วไป');
  assert.equal(prepared.verify.title, 'รายจ่ายทั่วไป');

  const executed = await executePreparedMasterIntent(runtime, prepared);
  assert.equal(executed.status, 'SUCCESS');
  assert.equal(executed.readback.title, 'รายจ่ายทั่วไป');
  assert.equal(executed.readback.subtype, 'EXPENSE');

  const state = await runtime.readState();
  const record = state.domains.LEDGER.records[prepared.input.ledgerTransactionId]?.record;
  assert.equal(record?.detail, 'OUT:EXPENSE');
  assert.equal(Object.hasOwn(record || {}, 'subtype'), false);

  const income = gateIntentProposal({
    action:'CREATE', object:'OTHER_INCOME',
    fields:{ title:null, amountBaht:150, paymentMode:null, note:null },
  });
  assert.equal(income.status, 'ASK');
  assert.deepEqual(income.missing, ['title']);
});
