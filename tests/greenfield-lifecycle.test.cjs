"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function stateWith({ store=[], ledger=[], calendar=[], ride=[] } = {}) {
  const bucket = records => ({ records:Object.fromEntries(records.map(record => [record.recordId, { record }])) });
  return { schema:2, revision:1, domains:{ STORE:bucket(store), LEDGER:bucket(ledger), CALENDAR:bucket(calendar), RIDE:bucket(ride) } };
}

test('OPEN and PARTIAL are actionable Calendar statuses while completed/cancelled are not', async () => {
  const { isCalendarActionableStatus } = await import('../ui/product-model.mjs');
  assert.equal(isCalendarActionableStatus('OPEN'), true);
  assert.equal(isCalendarActionableStatus('PARTIAL'), true);
  assert.equal(isCalendarActionableStatus('COMPLETED'), false);
  assert.equal(isCalendarActionableStatus('CANCELLED'), false);
});

test('imported PARTIAL receivable stays in Store receivable projection', async () => {
  const { projectStore } = await import('../ui/product-model.mjs');
  const state = stateWith({ calendar:[
    { recordId:'Q-RCV', type:'RECEIVE_CUSTOMER_PAYMENT', amountSatang:3500, paidSatang:1500, dueDate:'2026-08-15', status:'PARTIAL', detail:'STORE/S1' },
  ] });
  assert.equal(projectStore(state, '2026-08-13').receivableSatang, 3500);
});

test('imported PARTIAL obligation stays in Finance pressure projection', async () => {
  const { projectFinance } = await import('../ui/product-model.mjs');
  const state = stateWith({
    ledger:[{ recordId:'O1', type:'OBLIGATION', remainingSatang:4000, status:'PARTIAL' }],
    calendar:[{ recordId:'Q-PAY', type:'PAY_OBLIGATION', amountSatang:4000, paidSatang:1000, dueDate:'2026-08-15', status:'PARTIAL', detail:'LEDGER/O1' }],
  });
  const view = projectFinance(state, 10000, '2026-08-13');
  assert.equal(view.nearTermDueSatang, 4000);
  assert.equal(view.nextDue.recordId, 'Q-PAY');
});

test('Calendar UI uses shared actionable lifecycle instead of exact OPEN-only gate', () => {
  const app = fs.readFileSync(path.join(root, 'ui/app.mjs'), 'utf8');
  assert.match(app, /isCalendarActionableStatus/);
  assert.doesNotMatch(app, /record\.status\s*!==\s*['"]OPEN['"]/);
});
