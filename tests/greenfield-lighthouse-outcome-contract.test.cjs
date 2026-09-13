const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const bridgePath = path.join(root, 'lighthouse-next/runtime-ledger.mjs');
const surfacePath = path.join(root, 'lighthouse-next/surface-contract.mjs');

async function loadBridge() {
  return import(`${bridgePath}?t=${Date.now()}-${Math.random()}`);
}

function stateWith({ ledger = [], calendar = [], revision = 11 } = {}) {
  return {
    revision,
    domains: {
      LEDGER: { records:Object.fromEntries(ledger.map(record => [record.recordId, { record }])) },
      CALENDAR: { records:Object.fromEntries(calendar.map(record => [record.recordId, { record }])) },
      STORE: { records:{} },
      RIDE: { records:{} },
    },
  };
}

function projectFor(state) {
  const balance = Object.values(state.domains.LEDGER.records)
    .map(entry => entry.record)
    .filter(record => record.type === 'TRANSACTION')
    .reduce((sum, record) => sum + (record.direction === 'IN' ? record.amountSatang : -record.amountSatang), 0);
  const calendar = Object.values(state.domains.CALENDAR.records).map(entry => entry.record);
  return {
    ledgerBalanceSatang:balance,
    calendar:{
      total:calendar.length,
      byStatus:calendar.reduce((acc, record) => { acc[record.status] = (acc[record.status] || 0) + 1; return acc; }, {}),
    },
    ride:{ todayRoundState:'NOT_STARTED', generatedSatang:0, cashJobSatang:0, creditJobSatang:0, expenseSatang:0, pendingCreditSatang:0 },
  };
}

test('recordExpense writes through runtime expense and verifies exact durable transaction', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  let state = stateWith();
  const calls = [];
  const runtime = {
    async expense(input) {
      calls.push(input);
      const record = { recordId:input.ledgerTransactionId, type:'TRANSACTION', direction:'OUT', amountSatang:input.amountSatang, title:input.title, detail:'OUT:EXPENSE', sourceRef:'LEDGER/MANUAL', status:'COMPLETED' };
      state = stateWith({ ledger:[record] });
    },
    async readState() { return state; },
    project() { return projectFor(state); },
  };
  const bridge = createLighthouseLedgerBridge({ withSession: operation => operation(runtime), projectFinancial: () => ({ todayInSatang:0, todayOutSatang:12500 }) });
  const result = await bridge.recordExpense({ workflowId:'WF-OUT-1', ledgerTransactionId:'TX-OUT-1', title:'ค่าน้ำมัน', amountBaht:125 });
  assert.deepEqual(calls, [{ workflowId:'WF-OUT-1', ledgerTransactionId:'TX-OUT-1', title:'ค่าน้ำมัน', amountSatang:12500 }]);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.record.direction, 'OUT');
  assert.equal(result.truth.todayOutSatang, 12500);
});

test('createObligation writes Ledger owner plus Calendar projection and verifies both', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  let state = stateWith();
  const runtime = {
    async obligation(input) {
      const obligation = { recordId:input.obligationId, type:'OBLIGATION', title:input.title, amountSatang:input.totalSatang, originalSatang:input.totalSatang, paidSatang:0, remainingSatang:input.totalSatang, installmentCount:1, installmentPlan:input.installments, dueDate:input.installments[0].dueDate, status:'OPEN' };
      const queue = { recordId:input.installments[0].queueId, type:'PAY_OBLIGATION', title:'จ่ายภาระ', detail:`LEDGER/${input.obligationId}`, amountSatang:input.totalSatang, paidSatang:0, dueDate:input.installments[0].dueDate, status:'OPEN' };
      state = stateWith({ ledger:[obligation], calendar:[queue] });
    },
    async readState() { return state; },
    project() { return projectFor(state); },
  };
  const bridge = createLighthouseLedgerBridge({ withSession: operation => operation(runtime), projectFinancial: () => ({ todayInSatang:0, todayOutSatang:0 }) });
  const result = await bridge.createObligation({ workflowId:'WF-OB-1', obligationId:'OB-1', queueId:'CAL-OB-1', title:'ค่าเช่ารถ', amountBaht:1800, dueDate:'2026-09-15' });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.obligation.remainingSatang, 180000);
  assert.equal(result.queue.detail, 'LEDGER/OB-1');
  assert.equal(result.calendarTruth.total, 1);
});

test('payObligation routes through owner action and returns Ledger plus Calendar readback', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const obligation = { recordId:'OB-2', type:'OBLIGATION', title:'ค่าห้อง', amountSatang:100000, originalSatang:100000, paidSatang:0, remainingSatang:100000, installmentCount:1, installmentPlan:[{ queueId:'CAL-OB-2', amountSatang:100000, dueDate:'2026-09-16', number:1 }], dueDate:'2026-09-16', status:'OPEN' };
  const queue = { recordId:'CAL-OB-2', type:'PAY_OBLIGATION', title:'จ่ายภาระ', detail:'LEDGER/OB-2', amountSatang:100000, paidSatang:0, dueDate:'2026-09-16', status:'OPEN' };
  let state = stateWith({ ledger:[obligation], calendar:[queue] });
  const calls = [];
  const runtime = {
    async payObligation(input) {
      calls.push(input);
      const paid = { ...obligation, amountSatang:60000, paidSatang:40000, remainingSatang:60000, status:'PARTIAL' };
      const tx = { recordId:input.ledgerTransactionId, type:'TRANSACTION', direction:'OUT', amountSatang:input.amountSatang, title:'ชำระ OB-2', detail:'OUT:OBLIGATION_PAYMENT', sourceRef:'LEDGER/OB-2', status:'COMPLETED' };
      const queueAfter = { ...queue, amountSatang:60000, paidSatang:40000, status:'PARTIAL' };
      state = stateWith({ ledger:[paid, tx], calendar:[queueAfter] });
    },
    async readState() { return state; },
    project() { return projectFor(state); },
  };
  const bridge = createLighthouseLedgerBridge({ withSession: operation => operation(runtime), projectFinancial: () => ({ todayInSatang:0, todayOutSatang:40000 }) });
  const result = await bridge.payObligation({ workflowId:'WF-PAY-2', obligationId:'OB-2', queueId:'CAL-OB-2', ledgerTransactionId:'TX-PAY-2', amountBaht:400 });
  assert.equal(calls[0].amountSatang, 40000);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.obligation.remainingSatang, 60000);
  assert.equal(result.queue.status, 'PARTIAL');
});

test('surface adapter exposes direct Outcome controls without routing through Chat parser', () => {
  const source = fs.readFileSync(surfacePath, 'utf8');
  assert.match(source, /manual-expense-form/);
  assert.match(source, /manual-obligation-form/);
  assert.match(source, /ledgerBridge\.recordExpense\(/);
  assert.match(source, /ledgerBridge\.createObligation\(/);
  assert.match(source, /ledgerBridge\.payObligation\(/);
  assert.doesNotMatch(source, /submitChatText\(/);
});
