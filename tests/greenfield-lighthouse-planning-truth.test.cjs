const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const bridgePath = path.join(process.cwd(), 'lighthouse-next', 'runtime-ledger.mjs');

async function loadBridge() {
  assert.equal(fs.existsSync(bridgePath), true, 'missing lighthouse-next/runtime-ledger.mjs');
  return import(`${bridgePath}?t=${Date.now()}-${Math.random()}`);
}

function stateFixture({ goalSatang = 120000 } = {}) {
  const goal = goalSatang == null ? {} : {
    '2026-09-18': { date:'2026-09-18', goalSatang, source:'MANUAL' },
  };
  const records = entries => ({ records:Object.fromEntries(entries.map(record => [record.recordId, { record }])) });
  return {
    revision:42,
    meta:{ dailyGoals:goal },
    domains:{
      LEDGER:records([
        { recordId:'OB-1', type:'OBLIGATION', title:'ค่าเช่ารถ', remainingSatang:70000, status:'OPEN' },
        { recordId:'TX-1', type:'TRANSACTION', direction:'IN', amountSatang:10000, title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', createdAt:'2026-09-18T01:00:00.000Z' },
      ]),
      STORE:records([
        { recordId:'SALE-1', type:'SALE', title:'ขายมือถือ', totalSatang:80000, receivedSatang:30000, outstandingSatang:50000, status:'ACTIVE' },
      ]),
      CALENDAR:records([
        { recordId:'CAL-REC-1', type:'RECEIVE_CUSTOMER_PAYMENT', title:'รับเงินมือถือ', detail:'STORE/SALE-1', amountSatang:50000, dueDate:'2026-09-19', status:'OPEN' },
        { recordId:'CAL-OB-1', type:'PAY_OBLIGATION', title:'จ่ายค่าเช่ารถ', detail:'LEDGER/OB-1', amountSatang:70000, dueDate:'2026-09-20', status:'OPEN' },
      ]),
      RIDE:records([]),
    },
  };
}

function runtimeFor(stateRef, calls = []) {
  return {
    async readState() { return structuredClone(stateRef.value); },
    project() {
      return {
        ledgerBalanceSatang:100000,
        ride:{
          todayRoundState:'ACTIVE',
          generatedSatang:30000,
          cashJobSatang:10000,
          creditJobSatang:20000,
          expenseSatang:5000,
          pendingCreditSatang:40000,
        },
        calendar:{ total:2, byStatus:{ OPEN:2 } },
      };
    },
    async ensureDailyGoal({ date, suggestedSatang }) {
      calls.push(['ensure', date, suggestedSatang]);
      stateRef.value.meta.dailyGoals[date] = { date, goalSatang:suggestedSatang, source:'AUTO' };
      return { status:'CREATED', goal:structuredClone(stateRef.value.meta.dailyGoals[date]), state:structuredClone(stateRef.value) };
    },
    async overrideDailyGoal({ date, goalSatang }) {
      calls.push(['override', date, goalSatang]);
      stateRef.value.meta.dailyGoals[date] = { ...stateRef.value.meta.dailyGoals[date], date, goalSatang, source:'MANUAL' };
      return { status:'UPDATED', goal:structuredClone(stateRef.value.meta.dailyGoals[date]), state:structuredClone(stateRef.value) };
    },
  };
}

function projectFinancial(_state, balance) {
  return {
    cashBalanceSatang:balance,
    spendableBalanceSatang:balance,
    todayInSatang:10000,
    todayOutSatang:5000,
    remainingObligationSatang:70000,
    monthDueSatang:70000,
    nearTermDueSatang:70000,
    shortfallSatang:0,
    nextDue:{ recordId:'CAL-OB-1', dueDate:'2026-09-20', amountSatang:70000, daysRemaining:2, canPayNow:true },
    collisionDates:[],
  };
}

test('planning truth combines durable receivables, ride pending credit, nearest obligation and daily goal without a second authority', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const stateRef = { value:stateFixture() };
  const runtime = runtimeFor(stateRef);
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial,
    now: () => new Date('2026-09-18T08:00:00+07:00'),
  });

  const truth = await bridge.readPlanningTruth();
  assert.equal(truth.date, '2026-09-18');
  assert.equal(truth.goalSatang, 120000);
  assert.equal(truth.outstandingReceivableSatang, 50000);
  assert.equal(truth.pendingRideCreditSatang, 40000);
  assert.equal(truth.expectedIncomingSatang, 90000);
  assert.equal(truth.spendableBalanceSatang, 100000);
  assert.deepEqual(truth.nextObligation, {
    recordId:'OB-1',
    queueId:'CAL-OB-1',
    title:'ค่าเช่ารถ',
    dueDate:'2026-09-20',
    amountSatang:70000,
    canPayNow:true,
  });
});

test('setDailyGoal updates the existing runtime-owned goal and verifies readback', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const stateRef = { value:stateFixture() };
  const calls = [];
  const runtime = runtimeFor(stateRef, calls);
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial,
    now: () => new Date('2026-09-18T08:00:00+07:00'),
  });

  const result = await bridge.setDailyGoal({ goalBaht:1500 });
  assert.deepEqual(calls, [['override','2026-09-18',150000]]);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.goalSatang, 150000);
});

test('setDailyGoal initializes a missing runtime-owned goal instead of inventing local UI state', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const stateRef = { value:stateFixture({ goalSatang:null }) };
  const calls = [];
  const runtime = runtimeFor(stateRef, calls);
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial,
    now: () => new Date('2026-09-18T08:00:00+07:00'),
  });

  const result = await bridge.setDailyGoal({ goalBaht:900 });
  assert.deepEqual(calls, [['ensure','2026-09-18',90000]]);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.goalSatang, 90000);
});

test('setDailyGoal fails closed when runtime readback disagrees', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const state = stateFixture();
  const runtime = {
    ...runtimeFor({ value:state }),
    async overrideDailyGoal() { return { status:'UPDATED' }; },
    async readState() { return state; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial,
    now: () => new Date('2026-09-18T08:00:00+07:00'),
  });

  await assert.rejects(() => bridge.setDailyGoal({ goalBaht:1500 }), /LIGHTHOUSE_DAILY_GOAL_READBACK_MISMATCH/);
});
