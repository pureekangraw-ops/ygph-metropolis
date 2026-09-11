const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next', 'view-model.mjs')).href;

async function loadViewModel() {
  return import(moduleUrl);
}

test('LIGHTHOUSE view model exposes stable READY EMPTY and UNAVAILABLE read states', async () => {
  const { READ_STATE } = await loadViewModel();
  assert.deepEqual(READ_STATE, {
    READY: 'READY',
    EMPTY: 'EMPTY',
    UNAVAILABLE: 'UNAVAILABLE',
  });
  assert.equal(Object.isFrozen(READ_STATE), true);
});

test('finance projection distinguishes unavailable truth from a real zero balance', async () => {
  const { READ_STATE, projectFinanceView } = await loadViewModel();

  assert.deepEqual(projectFinanceView(null), {
    status: READ_STATE.UNAVAILABLE,
    cashSatang: null,
    todayIncomeSatang: null,
    todayExpenseSatang: null,
    netSatang: null,
  });

  assert.deepEqual(projectFinanceView({
    balanceSatang: 0,
    todayInSatang: 0,
    todayOutSatang: 0,
    netSatang: 0,
  }), {
    status: READ_STATE.READY,
    cashSatang: 0,
    todayIncomeSatang: 0,
    todayExpenseSatang: 0,
    netSatang: 0,
  });

  assert.equal(projectFinanceView({
    balanceSatang: 100,
    todayInSatang: 10,
    todayOutSatang: undefined,
    netSatang: 10,
  }).status, READ_STATE.UNAVAILABLE);
});

test('Store projection keeps EMPTY separate from UNAVAILABLE and clones durable Product truth', async () => {
  const { READ_STATE, projectStoreView } = await loadViewModel();

  assert.deepEqual(projectStoreView(null), {
    status: READ_STATE.UNAVAILABLE,
    products: [],
    legacyUnassignedQuantity: null,
  });

  assert.deepEqual(projectStoreView({ products: [], legacyUnassignedQuantity: 0 }), {
    status: READ_STATE.EMPTY,
    products: [],
    legacyUnassignedQuantity: 0,
  });

  const source = {
    products: [{
      productId: 'P1',
      name: 'น้ำ',
      model: 'ขวด',
      color: null,
      descriptors: ['เย็น'],
      quantity: 2,
    }],
    legacyUnassignedQuantity: 3,
  };
  const projected = projectStoreView(source);
  assert.equal(projected.status, READ_STATE.READY);
  assert.equal(projected.legacyUnassignedQuantity, 3);
  assert.deepEqual(projected.products, source.products);
  assert.notEqual(projected.products, source.products);
  assert.notEqual(projected.products[0], source.products[0]);
  assert.notEqual(projected.products[0].descriptors, source.products[0].descriptors);
});

test('Ledger history projection distinguishes empty truth and never exposes mutable runtime references', async () => {
  const { READ_STATE, projectLedgerHistoryView } = await loadViewModel();

  assert.deepEqual(projectLedgerHistoryView(null), {
    status: READ_STATE.UNAVAILABLE,
    transactions: [],
  });
  assert.deepEqual(projectLedgerHistoryView({ transactions: [] }), {
    status: READ_STATE.EMPTY,
    transactions: [],
  });

  const transaction = { id: 'T1', title: 'รายได้', amountSatang: 5000, metadata: { source: 'test' } };
  const source = { transactions: [transaction] };
  const projected = projectLedgerHistoryView(source);
  assert.equal(projected.status, READ_STATE.READY);
  assert.deepEqual(projected.transactions, source.transactions);
  assert.notEqual(projected.transactions, source.transactions);
  assert.notEqual(projected.transactions[0], transaction);
  assert.notEqual(projected.transactions[0].metadata, transaction.metadata);
});

test('explicit unavailable projection carries only bounded presentation state', async () => {
  const { READ_STATE, projectUnavailableView } = await loadViewModel();
  assert.deepEqual(projectUnavailableView('ยังไม่เชื่อมข้อมูลจริง'), {
    status: READ_STATE.UNAVAILABLE,
    message: 'ยังไม่เชื่อมข้อมูลจริง',
  });
});
