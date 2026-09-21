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
  assert.equal('pickup' in state.domains.RIDE.records['JOB-CASH'].record, false);
  assert.equal('dropoff' in state.domains.RIDE.records['JOB-CASH'].record, false);
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


test('ride job geography is optional owner truth and does not change Ride or Ledger accounting', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { projectRideRound } = await import('../greenfield/ride-domain.mjs');
  const { buildRideStartRoundWorkflow, buildRideJobWorkflow } = await import('../greenfield/ride-workflows.mjs');
  let state = createGreenfieldState();
  state = await apply(state, buildRideStartRoundWorkflow({ workflowId:'WF-GEO-START', roundId:'ROUND-GEO' }).commands);
  state = await apply(state, buildRideJobWorkflow({
    workflowId:'WF-GEO-JOB',
    roundId:'ROUND-GEO',
    jobId:'JOB-GEO',
    ledgerTransactionId:'TX-GEO',
    amountSatang:13500,
    paymentMode:'CASH',
    note:'งานมีพิกัด',
    pickup:{ label:'จุดรับ', address:'Bang Khen, Bangkok', lat:'13.8732', lng:'100.5961' },
    dropoff:{ label:'จุดส่ง', lat:13.7563, lng:100.5018 },
  }).commands);

  const job = state.domains.RIDE.records['JOB-GEO'].record;
  assert.deepEqual(job.pickup, { lat:13.8732, lng:100.5961, label:'จุดรับ', address:'Bang Khen, Bangkok' });
  assert.deepEqual(job.dropoff, { lat:13.7563, lng:100.5018, label:'จุดส่ง' });
  assert.equal(state.domains.LEDGER.records['TX-GEO'].record.amountSatang, 13500);
  assert.equal(state.domains.LEDGER.records['TX-GEO'].record.detail, 'IN:RIDE_CASH');

  const round = projectRideRound(state, 'ROUND-GEO');
  assert.equal(round.generatedSatang, 13500);
  assert.equal(round.cashJobSatang, 13500);
  assert.equal(round.jobCount, 1);
});

test('ride job geography fails closed on incomplete or out-of-range coordinates', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildRideStartRoundWorkflow, buildRideJobWorkflow } = await import('../greenfield/ride-workflows.mjs');
  let state = createGreenfieldState();
  state = await apply(state, buildRideStartRoundWorkflow({ workflowId:'WF-GEO-INVALID-START', roundId:'ROUND-GEO-INVALID' }).commands);

  await assert.rejects(
    apply(state, buildRideJobWorkflow({
      workflowId:'WF-GEO-BAD-LAT', roundId:'ROUND-GEO-INVALID', jobId:'JOB-BAD-LAT',
      amountSatang:10000, paymentMode:'CREDIT', pickup:{ lat:91, lng:100.5 },
    }).commands),
    /INVALID_RIDE_PICKUP_LAT/,
  );

  await assert.rejects(
    apply(state, buildRideJobWorkflow({
      workflowId:'WF-GEO-MISSING-LNG', roundId:'ROUND-GEO-INVALID', jobId:'JOB-MISSING-LNG',
      amountSatang:10000, paymentMode:'CREDIT', dropoff:{ lat:13.7 },
    }).commands),
    /INVALID_RIDE_DROPOFF_LNG/,
  );

  await assert.rejects(
    apply(state, buildRideJobWorkflow({
      workflowId:'WF-GEO-BLANK', roundId:'ROUND-GEO-INVALID', jobId:'JOB-BLANK',
      amountSatang:10000, paymentMode:'CREDIT', pickup:{ lat:'', lng:'100.5' },
    }).commands),
    /INVALID_RIDE_PICKUP_LAT/,
  );

  await assert.rejects(
    apply(state, buildRideJobWorkflow({
      workflowId:'WF-GEO-NULL', roundId:'ROUND-GEO-INVALID', jobId:'JOB-NULL',
      amountSatang:10000, paymentMode:'CREDIT', pickup:{ lat:null, lng:100.5 },
    }).commands),
    /INVALID_RIDE_PICKUP_LAT/,
  );

  assert.equal('JOB-BAD-LAT' in state.domains.RIDE.records, false);
  assert.equal('JOB-MISSING-LNG' in state.domains.RIDE.records, false);
  assert.equal('JOB-BLANK' in state.domains.RIDE.records, false);
  assert.equal('JOB-NULL' in state.domains.RIDE.records, false);
});
