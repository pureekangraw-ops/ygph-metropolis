"use strict";
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

async function commandRuntime() {
  const { createCommandRuntime } = await import('../greenfield/command-runtime.mjs');
  const { registerGreenfieldDomainCommands } = await import('../greenfield/domain-operations.mjs');
  const runtime = createCommandRuntime();
  registerGreenfieldDomainCommands(runtime, { now: () => '2026-08-18T16:30:00.000Z' });
  return runtime;
}

async function apply(state, commands) {
  const runtime = await commandRuntime();
  let next = state;
  for (const command of commands) next = await runtime.execute(next, { ...command, expectedRevision: next.revision });
  return next;
}

test('balance adjustment creates only the delta needed to reach the owner-observed cash truth', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildOtherIncomeWorkflow, buildBalanceAdjustmentWorkflow } = await import('../greenfield/business-workflows.mjs');
  const { projectLedgerBalance } = await import('../greenfield/projections.mjs');

  let state = createGreenfieldState();
  state = await apply(state, buildOtherIncomeWorkflow({ workflowId:'WF-SEED', ledgerTransactionId:'TX-SEED', title:'seed', amountSatang:100000 }).commands);
  assert.equal(projectLedgerBalance(state), 100000);

  const down = buildBalanceAdjustmentWorkflow({ workflowId:'WF-ADJ-DOWN', ledgerTransactionId:'TX-ADJ-DOWN', currentBalanceSatang:100000, targetBalanceSatang:75000, reason:'นับเงินจริง' });
  assert.equal(down.commands[0].payload.direction, 'OUT');
  assert.equal(down.commands[0].payload.amountSatang, 25000);
  assert.equal(down.commands[0].payload.balanceBeforeSatang, 100000);
  assert.equal(down.commands[0].payload.balanceAfterSatang, 75000);
  state = await apply(state, down.commands);
  assert.equal(projectLedgerBalance(state), 75000);
  assert.equal(state.domains.LEDGER.records['TX-ADJ-DOWN'].record.detail, 'OUT:BALANCE_ADJUSTMENT');

  const up = buildBalanceAdjustmentWorkflow({ workflowId:'WF-ADJ-UP', ledgerTransactionId:'TX-ADJ-UP', currentBalanceSatang:75000, targetBalanceSatang:120000, reason:'นับเงินจริง' });
  assert.equal(up.commands[0].payload.direction, 'IN');
  assert.equal(up.commands[0].payload.amountSatang, 45000);
  state = await apply(state, up.commands);
  assert.equal(projectLedgerBalance(state), 120000);
  assert.equal(state.domains.LEDGER.records['TX-ADJ-UP'].record.detail, 'IN:BALANCE_ADJUSTMENT');
});

test('balance adjustment rejects invalid or unchanged target instead of fabricating income or expense', async () => {
  const { buildBalanceAdjustmentWorkflow } = await import('../greenfield/business-workflows.mjs');
  assert.throws(() => buildBalanceAdjustmentWorkflow({ workflowId:'WF-SAME', ledgerTransactionId:'TX-SAME', currentBalanceSatang:50000, targetBalanceSatang:50000, reason:'ตรวจเงินจริง' }), /BALANCE_ALREADY_MATCHES/);
  assert.throws(() => buildBalanceAdjustmentWorkflow({ workflowId:'WF-BAD', ledgerTransactionId:'TX-BAD', currentBalanceSatang:50000, targetBalanceSatang:-1, reason:'ตรวจเงินจริง' }), /INVALID_TARGET_BALANCE/);
});

test('balance adjustment changes cash truth but is excluded from daily income and expense cards', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { buildOtherIncomeWorkflow, buildBalanceAdjustmentWorkflow } = await import('../greenfield/business-workflows.mjs');
  const { projectLedgerBalance } = await import('../greenfield/projections.mjs');
  const { projectFinancialTruth } = await import('../greenfield/calculation-authority.mjs');
  let state = createGreenfieldState({ now:'2026-08-18T09:00:00.000Z' });
  state = await apply(state, buildOtherIncomeWorkflow({ workflowId:'WF-IN', ledgerTransactionId:'TX-IN', title:'รายรับจริง', amountSatang:100000 }).commands);
  state = await apply(state, buildBalanceAdjustmentWorkflow({ workflowId:'WF-ADJ', ledgerTransactionId:'TX-ADJ', currentBalanceSatang:100000, targetBalanceSatang:75000, reason:'นับเงินจริง' }).commands);
  const finance = projectFinancialTruth(state, projectLedgerBalance(state), '2026-08-18');
  assert.equal(finance.cashBalanceSatang, 75000);
  assert.equal(finance.todayInSatang, 100000);
  assert.equal(finance.todayOutSatang, 0);
});

test('Finance keeps one green manage launcher and injects balance adjustment inside that flow', () => {
  const app = fs.readFileSync('app.mjs', 'utf8');
  const popup = fs.readFileSync('ui/action-popups.mjs', 'utf8');
  assert.match(popup, /label:'จัดการการเงิน'/);
  assert.match(app, /data-city-action-open=\"finance-actions\"/);
  assert.match(app, /button\.textContent = 'ปรับฐานเงิน'/);
  assert.match(app, /id=\"balanceAdjustmentForm\"/);
  assert.match(app, /adjustmentRuntime\.adjustBalance/);
  assert.doesNotMatch(app, /makeCityActionLauncher\('balance-adjustment'/);
});
