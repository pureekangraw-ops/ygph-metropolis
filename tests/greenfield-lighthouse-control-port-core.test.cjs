const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/control-port.mjs')).href;

function fixture() {
  let revision = 7;
  let updatedAt = '2026-09-18T07:00:00.000Z';
  const state = () => ({
    schema:2,
    revision,
    updatedAt,
    createdAt:'2026-09-18T06:00:00.000Z',
    domains:{ LEDGER:{records:{}}, STORE:{records:{}}, CALENDAR:{records:{}}, RIDE:{records:{}} },
  });
  const withSession = async operation => operation({ readState:async () => state() });

  const ledgerBridge = {
    readLedgerTruth:async () => ({ revision, balanceSatang:5000, todayInSatang:1000, todayOutSatang:200, netSatang:800, transactions:[], obligations:[] }),
    readIncomeTruth:async () => ({ revision, receivables:[] }),
    readCalendarTruth:async () => ({ revision, records:[] }),
    readRideTruth:async () => ({ revision, generatedSatang:0 }),
    readPlanningTruth:async () => ({ revision, goalSatang:120000 }),
    setDailyGoal:async () => { revision += 1; updatedAt='2026-09-18T07:01:00.000Z'; return { status:'VERIFIED' }; },
    recordOtherIncome:async () => { revision += 1; updatedAt='2026-09-18T07:02:00.000Z'; return { status:'VERIFIED' }; },
    recordExpense:async () => { revision += 1; updatedAt='2026-09-18T07:03:00.000Z'; return { status:'VERIFIED' }; },
    createObligation:async () => ({ status:'VERIFIED' }),
    rescheduleCalendar:async () => ({ status:'VERIFIED' }),
    payObligation:async () => ({ status:'VERIFIED' }),
    receiveReceivablePayment:async () => ({ status:'VERIFIED' }),
    setCalendarStatus:async () => ({ status:'VERIFIED' }),
  };
  const storeBridge = {
    readStoreTruth:async () => ({ revision, products:[] }),
    createProductWithStock:async () => ({ status:'VERIFIED' }),
    addProductStock:async () => ({ status:'VERIFIED' }),
  };
  return { withSession, ledgerBridge, storeBridge };
}

test('Control Port read surfaces carry owner revision and updatedAt', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());

  const money = await port.query({ capabilityId:'finance.balance' });
  assert.equal(money.value, 5000);
  assert.equal(money.revision, 7);
  assert.equal(money.updatedAt, '2026-09-18T07:00:00.000Z');

  const app = await port.query({ capabilityId:'system.appState' });
  assert.equal(app.value.schema, 2);
  assert.equal(app.revision, 7);
});

test('Control Port guard is direct for daily goal, confirm-required for money mutation, and forbidden for derived truth/secrets', async () => {
  const { createLighthouseControlPort, CONTROL_PORT_GUARD } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());

  assert.equal(port.propose({ requestId:'r1', capabilityId:'finance.dailyGoal', payload:{goalBaht:1200} }).guard, CONTROL_PORT_GUARD.DIRECT);
  assert.equal(port.propose({ requestId:'r2', capabilityId:'finance.expense.create', payload:{title:'ข้าว',amountBaht:60} }).guard, CONTROL_PORT_GUARD.CONFIRM_REQUIRED);
  assert.equal(port.propose({ requestId:'r3', capabilityId:'finance.balance' }).guard, CONTROL_PORT_GUARD.FORBIDDEN);
  assert.equal(port.propose({ requestId:'r4', capabilityId:'security.pin' }).guard, CONTROL_PORT_GUARD.FORBIDDEN);
});

test('Control Port refuses unconfirmed guarded mutation and commits through owner bridge after confirmation', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());
  const proposal = port.propose({
    requestId:'income-1',
    capabilityId:'finance.income.create',
    payload:{ source:'งาน', amountBaht:100 },
  });

  const blocked = await port.commit(proposal);
  assert.equal(blocked.status, 'CONFIRMATION_REQUIRED');
  assert.equal(blocked.revision, 7);

  const committed = await port.commit(proposal, { confirmed:true });
  assert.equal(committed.status, 'VERIFIED');
  assert.equal(committed.beforeRevision, 7);
  assert.equal(committed.afterRevision, 8);
  assert.equal(committed.updatedAt, '2026-09-18T07:02:00.000Z');
});

test('Control Port derived balance cannot be committed', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());
  const proposal = port.propose({ requestId:'balance-1', capabilityId:'finance.balance' });
  await assert.rejects(() => port.commit(proposal), /MUTATION_FORBIDDEN/);
});
