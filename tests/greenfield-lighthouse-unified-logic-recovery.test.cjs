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

test('Ledger reversal workflow exposes one append-only owner command', async () => {
  const workflows = await import(`../greenfield/business-workflows.mjs?t=${Date.now()}-${Math.random()}`);
  assert.equal(typeof workflows.buildLedgerReversalWorkflow, 'function');
  const plan = workflows.buildLedgerReversalWorkflow({
    workflowId:'WF-REV-1', originalRecordId:'TX-OUT-1', reversalRecordId:'TX-REV-1', reason:'ลงรายการผิด',
  });
  assert.equal(plan.commands.length, 1);
  assert.deepEqual(plan.commands[0], {
    commandId:'WF-REV-1:1', idempotencyKey:'WF-REV-1:LEDGER:TX-REV-1', domain:'LEDGER', type:'LEDGER_REVERSE_TRANSACTION',
    payload:{ originalRecordId:'TX-OUT-1', reversalRecordId:'TX-REV-1', reason:'ลงรายการผิด' },
  });
});

test('reverseLedgerTransaction delegates to owner runtime and verifies append-only readback', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const original = {
    recordId:'TX-OUT-1', source:'LEDGER', type:'TRANSACTION', title:'ค่าอาหาร', detail:'OUT:EXPENSE',
    direction:'OUT', amountSatang:6500, status:'COMPLETED', sourceRef:'LEDGER/MANUAL', createdAt:'2026-09-14T01:00:00.000Z',
  };
  let state = stateWith({ ledger:[original] });
  const calls = [];
  const runtime = {
    async reverseLedgerTransaction(input) {
      calls.push(input);
      state = stateWith({ revision:13, ledger:[original, {
        recordId:'TX-REV-1', source:'LEDGER', type:'TRANSACTION', title:'ย้อนรายการ ค่าอาหาร', detail:'IN:REVERSAL',
        direction:'IN', amountSatang:6500, status:'COMPLETED', sourceRef:'LEDGER/TX-OUT-1', reversalOf:'TX-OUT-1',
        reason:'ลงรายการผิด', createdAt:'2026-09-14T02:00:00.000Z',
      }] });
      return { status:'COMMITTED' };
    },
    async readState() { return state; },
    project() { return { ledgerBalanceSatang:0 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:6500, todayOutSatang:6500 }),
  });

  const result = await bridge.reverseLedgerTransaction({
    workflowId:'WF-REV-1', originalRecordId:'TX-OUT-1', reversalRecordId:'TX-REV-1', reason:'ลงรายการผิด',
  });

  assert.deepEqual(calls, [{ workflowId:'WF-REV-1', originalRecordId:'TX-OUT-1', reversalRecordId:'TX-REV-1', reason:'ลงรายการผิด' }]);
  assert.deepEqual(state.domains.LEDGER.records['TX-OUT-1'].record, original, 'original transaction must remain unchanged');
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.original.recordId, 'TX-OUT-1');
  assert.equal(result.reversal.recordId, 'TX-REV-1');
  assert.equal(result.reversal.reversalOf, 'TX-OUT-1');
  assert.equal(result.reversal.direction, 'IN');
  assert.equal(result.reversal.amountSatang, 6500);
});

test('reverseLedgerTransaction blocks reversing a reversal before owner mutation', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const reversal = {
    recordId:'TX-REV-OLD', source:'LEDGER', type:'TRANSACTION', title:'ย้อนรายการ', detail:'IN:REVERSAL', direction:'IN',
    amountSatang:6500, status:'COMPLETED', sourceRef:'LEDGER/TX-OUT-1', reversalOf:'TX-OUT-1', createdAt:'2026-09-14T02:00:00.000Z',
  };
  const state = stateWith({ ledger:[reversal] });
  let called = false;
  const runtime = {
    async reverseLedgerTransaction() { called = true; },
    async readState() { return state; },
    project() { return { ledgerBalanceSatang:6500 }; },
  };
  const bridge = createLighthouseLedgerBridge({ withSession: operation => operation(runtime), projectFinancial: () => ({ todayInSatang:6500, todayOutSatang:0 }) });

  await assert.rejects(
    bridge.reverseLedgerTransaction({ workflowId:'WF-REV-BAD', originalRecordId:'TX-REV-OLD', reversalRecordId:'TX-REV-NEW', reason:'ห้ามย้อนซ้ำ' }),
    /LIGHTHOUSE_LEDGER_REVERSAL_NOT_ALLOWED/,
  );
  assert.equal(called, false);
});
