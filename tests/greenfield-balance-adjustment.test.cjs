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

test('Finance management exposes one balance adjustment action inside the existing green manage flow', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const app = fs.readFileSync('ui/app.mjs', 'utf8');
  const popup = fs.readFileSync('ui/action-popups.mjs', 'utf8');

  assert.equal((html.match(/id="balanceAdjustForm"/g) || []).length, 1);
  assert.match(html, /ปรับฐานเงิน/);
  assert.match(app, /bindForm\('balanceAdjustForm'/);
  assert.match(app, /adjustBalance/);
  assert.match(popup, /'balance-adjust':\s*\{\s*formId:'balanceAdjustForm',\s*label:'ปรับฐานเงิน'/s);
  assert.match(popup, /\{ kind:'task', key:'balance-adjust', label:'ปรับฐานเงิน'/);
  assert.match(popup, /collapseCityLaunchers\('\[data-area-page="finance"\]'[^\n]*'balance-adjust'/);
});
