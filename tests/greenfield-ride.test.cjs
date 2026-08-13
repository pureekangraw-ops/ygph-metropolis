"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function commandRuntime() {
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const { registerRideDomainCommands } = await import('../greenfield/ride-domain.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-13T01:00:00.000Z' });
  registerRideDomainCommands(runtime, { now: () => '2026-08-13T01:00:00.000Z' });
  return runtime;
}

async function apply(state, commands) {
  const runtime = await commandRuntime();
  let next = state;
  for (const command of commands) next = await runtime.execute(next, { ...command, expectedRevision: next.revision });
  return next;
}

test('ride round lifecycle has one active round and closes explicitly', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildRideStartRoundWorkflow, buildRideEndRoundWorkflow } = await import('../greenfield/ride-workflows.mjs');
  let state = createGreenfieldState();
  state = await apply(state, buildRideStartRoundWorkflow({ workflowId:'WF-RIDE-START', roundId:'ROUND-1' }).commands);
  assert.equal(state.domains.RIDE.records['ROUND-1'].record.status, 'ACTIVE');
  await assert.rejects(apply(state, buildRideStartRoundWorkflow({ workflowId:'WF-RIDE-START-2', roundId:'ROUND-2' }).commands), /RIDE_ACTIVE_ROUND_EXISTS/);
  state = await apply(state, buildRideEndRoundWorkflow({ workflowId:'WF-RIDE-END', roundId:'ROUND-1' }).commands);
  assert.equal(state.domains.RIDE.records['ROUND-1'].record.status, 'CLOSED');
});

test('cash ride job creates RIDE truth plus real Ledger IN while credit job stays non-cash', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildRideStartRoundWorkflow, buildRideJobWorkflow } = await import('../greenfield/ride-workflows.mjs');
  let state = createGreenfieldState();
  state = await apply(state, buildRideStartRoundWorkflow({ workflowId:'WF-START', roundId:'ROUND-1' }).commands);
  state = await apply(state, buildRideJobWorkflow({ workflowId:'WF-CASH', roundId:'ROUND-1', jobId:'JOB-CASH', ledgerTransactionId:'TX-CASH', amountSatang:12000, paymentMode:'CASH', note:'งานเงินสด' }).commands);
  assert.equal(state.domains.RIDE.records['JOB-CASH'].record.paymentMode, 'CASH');
  assert.equal(state.domains.RIDE.records['JOB-CASH'].record.amountSatang, 12000);
  assert.equal(state.domains.LEDGER.records['TX-CASH'].record.detail, 'IN:RIDE_CASH');
  const ledgerCount = Object.keys(state.domains.LEDGER.records).length;
  state = await apply(state, buildRideJobWorkflow({ workflowId:'WF-CREDIT', roundId:'ROUND-1', jobId:'JOB-CREDIT', amountSatang:18000, paymentMode:'CREDIT', note:'งานเครดิต' }).commands);
  assert.equal(state.domains.RIDE.records['JOB-CREDIT'].record.paymentMode, 'CREDIT');
  assert.equal(Object.keys(state.domains.LEDGER.records).length, ledgerCount);
});

test('ride expense creates RIDE expense plus real Ledger OUT', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildRideStartRoundWorkflow, buildRideExpenseWorkflow } = await import('../greenfield/ride-workflows.mjs');
  let state = createGreenfieldState();
  state = await apply(state, buildRideStartRoundWorkflow({ workflowId:'WF-START', roundId:'ROUND-1' }).commands);
  state = await apply(state, buildRideExpenseWorkflow({ workflowId:'WF-EXP', roundId:'ROUND-1', expenseId:'EXP-1', ledgerTransactionId:'TX-EXP', title:'ค่าน้ำมัน', amountSatang:5000 }).commands);
  assert.equal(state.domains.RIDE.records['EXP-1'].record.type, 'EXPENSE');
  assert.equal(state.domains.LEDGER.records['TX-EXP'].record.detail, 'OUT:RIDE_EXPENSE');
});

test('ride credit withdrawal cannot exceed earned pending credit and creates Ledger IN only when valid', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildRideStartRoundWorkflow, buildRideJobWorkflow, buildRideWithdrawCreditWorkflow } = await import('../greenfield/ride-workflows.mjs');
  let state = createGreenfieldState();
  state = await apply(state, buildRideStartRoundWorkflow({ workflowId:'WF-START', roundId:'ROUND-1' }).commands);
  state = await apply(state, buildRideJobWorkflow({ workflowId:'WF-CREDIT', roundId:'ROUND-1', jobId:'JOB-CREDIT', amountSatang:18000, paymentMode:'CREDIT' }).commands);
  state = await apply(state, buildRideWithdrawCreditWorkflow({ workflowId:'WF-WD', withdrawalId:'WD-1', ledgerTransactionId:'TX-WD', amountSatang:12000 }).commands);
  assert.equal(state.domains.RIDE.records['WD-1'].record.type, 'CREDIT_WITHDRAWAL');
  assert.equal(state.domains.LEDGER.records['TX-WD'].record.detail, 'IN:RIDE_CREDIT_WITHDRAWAL');
  await assert.rejects(apply(state, buildRideWithdrawCreditWorkflow({ workflowId:'WF-WD-OVER', withdrawalId:'WD-2', ledgerTransactionId:'TX-WD-2', amountSatang:7000 }).commands), /RIDE_CREDIT_OVERDRAW/);
  assert.equal('WD-2' in state.domains.RIDE.records, false);
  assert.equal('TX-WD-2' in state.domains.LEDGER.records, false);
});
