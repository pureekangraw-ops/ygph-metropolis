"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('Calendar reschedule changes only due date, archives prior Calendar truth, and never mutates Ledger', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-14T00:20:00.000Z' });
  const state = createGreenfieldState();
  state.domains.CALENDAR.records.Q1 = {
    record:{ recordId:'Q1', source:'CALENDAR', type:'PAY_OBLIGATION', title:'จ่ายภาระ', detail:'LEDGER/O1', amountSatang:502400, paidSatang:0, dueDate:'2026-08-14', status:'OPEN', updatedAt:'2026-08-13T00:00:00.000Z' },
    provenance:{ origin:'LIVE_COMMAND' }, history:[]
  };
  state.domains.LEDGER.records.O1 = { record:{ recordId:'O1', source:'LEDGER', type:'OBLIGATION', title:'ภาระ', amountSatang:502400, remainingSatang:502400, status:'OPEN' }, provenance:{ origin:'LIVE_COMMAND' }, history:[] };
  const ledgerBefore = structuredClone(state.domains.LEDGER);

  const next = await runtime.execute(state, {
    commandId:'C-RESCHEDULE', idempotencyKey:'K-RESCHEDULE', domain:'CALENDAR', type:'CALENDAR_RESCHEDULE', expectedRevision:1,
    payload:{ recordId:'Q1', dueDate:'2026-08-20' }
  });

  const queue = next.domains.CALENDAR.records.Q1;
  assert.equal(queue.record.dueDate, '2026-08-20');
  assert.equal(queue.record.amountSatang, 502400);
  assert.equal(queue.record.paidSatang, 0);
  assert.equal(queue.record.status, 'OPEN');
  assert.equal(queue.record.detail, 'LEDGER/O1');
  assert.equal(queue.history.length, 1);
  assert.equal(queue.history[0].record.dueDate, '2026-08-14');
  assert.deepEqual(next.domains.LEDGER, ledgerBefore);
});

test('Calendar reschedule rejects closed queues', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime);
  const state = createGreenfieldState();
  state.domains.CALENDAR.records.Q1 = { record:{ recordId:'Q1', source:'CALENDAR', type:'PAY_OBLIGATION', title:'จ่ายภาระ', amountSatang:100, dueDate:'2026-08-14', status:'CANCELLED' }, provenance:{ origin:'LIVE_COMMAND' }, history:[] };
  await assert.rejects(runtime.execute(state, {
    commandId:'C-RESCHEDULE', idempotencyKey:'K-RESCHEDULE', domain:'CALENDAR', type:'CALENDAR_RESCHEDULE', expectedRevision:1,
    payload:{ recordId:'Q1', dueDate:'2026-08-20' }
  }), /CALENDAR_RECORD_CLOSED/);
});
