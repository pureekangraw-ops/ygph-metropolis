const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = process.cwd();
const bridgePath = path.join(root, 'lighthouse-next/runtime-ledger.mjs');

async function loadBridge() {
  return import(`${bridgePath}?t=${Date.now()}-${Math.random()}`);
}

function wrap(records = []) {
  return Object.fromEntries(records.map(record => [record.recordId, { record }]));
}

function stateWith({ revision = 12, ledger = [], store = [], calendar = [] } = {}) {
  return {
    revision,
    domains: {
      LEDGER: { records:wrap(ledger) },
      STORE: { records:wrap(store) },
      CALENDAR: { records:wrap(calendar) },
      RIDE: { records:{} },
    },
  };
}

function sale(overrides = {}) {
  return {
    recordId:'SALE-1', source:'STORE', type:'SALE', title:'งานออกแบบ',
    amountSatang:10000, totalSatang:10000, receivedSatang:2000,
    outstandingSatang:8000, storeCostSatang:0, netIncomeSatang:2000,
    quantity:1, status:'PARTIAL', createdAt:'2026-09-14T01:00:00.000Z',
    ...overrides,
  };
}

function receivableQueue(overrides = {}) {
  return {
    recordId:'CAL-RECV-1', source:'CALENDAR', type:'RECEIVE_CUSTOMER_PAYMENT',
    title:'รับเงินลูกค้า', detail:'STORE/SALE-1', amountSatang:8000,
    paidSatang:0, dueDate:'2026-09-20', status:'OPEN',
    ...overrides,
  };
}

test('readIncomeTruth keeps outstanding receivables outside real cash', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const state = stateWith({ store:[sale()], calendar:[receivableQueue()] });
  const runtime = {
    async readState() { return state; },
    project() { return { ledgerBalanceSatang:2000 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:2000, todayOutSatang:0 }),
    now: () => new Date('2026-09-14T12:00:00+07:00'),
  });

  const truth = await bridge.readIncomeTruth();

  assert.equal(truth.balanceSatang, 2000, 'outstanding receivable must not inflate real cash');
  assert.equal(truth.todayInSatang, 2000);
  assert.equal(truth.outstandingReceivableSatang, 8000);
  assert.equal(truth.receivables.length, 1);
  assert.equal(truth.receivables[0].saleId, 'SALE-1');
  assert.equal(truth.receivables[0].queueId, 'CAL-RECV-1');
  assert.equal(truth.receivables[0].receivedSatang, 2000);
  assert.equal(truth.receivables[0].outstandingSatang, 8000);
});

test('receiveReceivablePayment uses owner runtime and verifies STORE + LEDGER + CALENDAR durable readback', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  let state = stateWith({ store:[sale()], calendar:[receivableQueue()] });
  const calls = [];
  const runtime = {
    async receiveCustomerPayment(input) {
      calls.push(input);
      state = stateWith({
        revision:13,
        store:[sale({ receivedSatang:5000, outstandingSatang:5000, netIncomeSatang:5000, status:'PARTIAL' })],
        ledger:[{
          recordId:'TX-RECV-1', source:'LEDGER', type:'TRANSACTION', title:'รับชำระ SALE-1',
          detail:'IN:SALE_RECEIPT', direction:'IN', amountSatang:3000, status:'COMPLETED',
          sourceRef:'STORE/SALE-1', createdAt:'2026-09-14T02:00:00.000Z',
        }],
        calendar:[receivableQueue({ amountSatang:5000, paidSatang:3000, status:'PARTIAL' })],
      });
      return { status:'COMMITTED' };
    },
    async readState() { return state; },
    project() { return { ledgerBalanceSatang:5000 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:5000, todayOutSatang:0 }),
    now: () => new Date('2026-09-14T12:00:00+07:00'),
  });

  const result = await bridge.receiveReceivablePayment({
    workflowId:'WF-RECV-1', saleId:'SALE-1', queueId:'CAL-RECV-1',
    ledgerTransactionId:'TX-RECV-1', amountBaht:30,
  });

  assert.deepEqual(calls, [{
    workflowId:'WF-RECV-1', saleId:'SALE-1', queueId:'CAL-RECV-1',
    ledgerTransactionId:'TX-RECV-1', amountSatang:3000,
  }]);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.sale.receivedSatang, 5000);
  assert.equal(result.sale.outstandingSatang, 5000);
  assert.equal(result.record.direction, 'IN');
  assert.equal(result.record.amountSatang, 3000);
  assert.equal(result.record.sourceRef, 'STORE/SALE-1');
  assert.equal(result.queue.status, 'PARTIAL');
  assert.equal(result.queue.amountSatang, 5000);
  assert.equal(result.incomeTruth.balanceSatang, 5000);
  assert.equal(result.incomeTruth.outstandingReceivableSatang, 5000);
});

test('receiveReceivablePayment fails closed when durable owner readback does not match', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const state = stateWith({ store:[sale()], calendar:[receivableQueue()] });
  const runtime = {
    async receiveCustomerPayment() { return { status:'COMMITTED' }; },
    async readState() { return state; },
    project() { return { ledgerBalanceSatang:2000 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:2000, todayOutSatang:0 }),
  });

  await assert.rejects(
    bridge.receiveReceivablePayment({
      workflowId:'WF-RECV-BAD', saleId:'SALE-1', queueId:'CAL-RECV-1',
      ledgerTransactionId:'TX-RECV-BAD', amountBaht:30,
    }),
    /LIGHTHOUSE_(RECEIVABLE|LEDGER|CALENDAR)_READBACK_MISMATCH/,
  );
});
