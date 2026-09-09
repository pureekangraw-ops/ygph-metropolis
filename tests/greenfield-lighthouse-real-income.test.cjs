const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const bridgePath = path.join(root, 'lighthouse-next/runtime-ledger.mjs');
const appPath = path.join(root, 'lighthouse-next/app.mjs');

async function loadBridge() {
  assert.equal(fs.existsSync(bridgePath), true, 'missing lighthouse-next/runtime-ledger.mjs');
  return import(`${bridgePath}?t=${Date.now()}-${Math.random()}`);
}

function ledgerState(records = [], revision = 7) {
  return {
    revision,
    domains: {
      LEDGER: { records:Object.fromEntries(records.map(record => [record.recordId, { record }])) },
      STORE: { records:{} },
      CALENDAR: { records:{} },
      RIDE: { records:{} },
    },
  };
}

test('recordOtherIncome writes exact satang and requires exact durable readback', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const calls = [];
  const record = {
    recordId:'TX-LH-1', type:'TRANSACTION', direction:'IN', amountSatang:5925,
    title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'COMPLETED',
    createdAt:'2026-09-09T03:00:00.000Z',
  };
  const runtime = {
    async otherIncome(input) { calls.push(input); return { status:'COMMITTED' }; },
    async readState() { return ledgerState([record]); },
    project() { return { ledgerBalanceSatang:15925 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:5925, todayOutSatang:0 }),
    now: () => new Date('2026-09-09T10:00:00+07:00'),
  });

  const result = await bridge.recordOtherIncome({
    workflowId:'WF-LH-1', ledgerTransactionId:'TX-LH-1', source:'ทิป', amountBaht:59.25,
  });

  assert.deepEqual(calls, [{
    workflowId:'WF-LH-1', ledgerTransactionId:'TX-LH-1', title:'ทิป', amountSatang:5925,
  }]);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.recovered, false);
  assert.equal(result.truth.balanceSatang, 15925);
});

test('locked runtime fails before a runtime mutation is available', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const bridge = createLighthouseLedgerBridge({
    withSession: async () => { throw new Error('RUNTIME_SESSION_LOCKED'); },
    projectFinancial: () => { throw new Error('not used'); },
  });
  await assert.rejects(
    bridge.recordOtherIncome({ workflowId:'WF', ledgerTransactionId:'TX', source:'ทิป', amountBaht:59 }),
    /RUNTIME_SESSION_LOCKED/,
  );
});

test('readback mismatch fails closed', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const bad = {
    recordId:'TX-LH-2', type:'TRANSACTION', direction:'IN', amountSatang:5800,
    title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'COMPLETED',
  };
  const runtime = {
    async otherIncome() {},
    async readState() { return ledgerState([bad]); },
    project() { return { ledgerBalanceSatang:5800 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:5800, todayOutSatang:0 }),
  });
  await assert.rejects(
    bridge.recordOtherIncome({ workflowId:'WF-LH-2', ledgerTransactionId:'TX-LH-2', source:'ทิป', amountBaht:59 }),
    /LIGHTHOUSE_LEDGER_READBACK_MISMATCH/,
  );
});

test('duplicate command retry recovers through exact readback', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const record = {
    recordId:'TX-LH-3', type:'TRANSACTION', direction:'IN', amountSatang:5900,
    title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'COMPLETED',
  };
  const runtime = {
    async otherIncome() { throw new Error('DUPLICATE_COMMAND:WF-LH-3:LEDGER:TX-LH-3'); },
    async readState() { return ledgerState([record]); },
    project() { return { ledgerBalanceSatang:5900 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:5900, todayOutSatang:0 }),
  });
  const result = await bridge.recordOtherIncome({
    workflowId:'WF-LH-3', ledgerTransactionId:'TX-LH-3', source:'ทิป', amountBaht:59,
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.recovered, true);
});

test('readLedgerTruth delegates daily cash truth to Greenfield calculation authority', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const oldRecord = { recordId:'TX-OLD', type:'TRANSACTION', direction:'OUT', amountSatang:1000, title:'เก่า', detail:'OUT:EXPENSE', createdAt:'2026-09-08T02:00:00.000Z' };
  const newRecord = { recordId:'TX-NEW', type:'TRANSACTION', direction:'IN', amountSatang:2500, title:'ใหม่', detail:'IN:OTHER_INCOME', createdAt:'2026-09-09T03:00:00.000Z' };
  const state = ledgerState([oldRecord, newRecord]);
  const seen = [];
  const runtime = {
    async readState() { return state; },
    project() { return { ledgerBalanceSatang:12345 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: (inputState, balance, today) => {
      seen.push({ inputState, balance, today });
      return { todayInSatang:2500, todayOutSatang:1000 };
    },
    now: () => new Date('2026-09-09T15:00:00+07:00'),
  });
  const truth = await bridge.readLedgerTruth();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].balance, 12345);
  assert.equal(truth.todayInSatang, 2500);
  assert.equal(truth.todayOutSatang, 1000);
  assert.equal(truth.netSatang, 1500);
  assert.deepEqual(truth.transactions.map(item => item.recordId), ['TX-NEW','TX-OLD']);
});
