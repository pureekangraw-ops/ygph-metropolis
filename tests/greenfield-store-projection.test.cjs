"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function stateWith(store, calendar = []) {
  const bucket = records => ({ records:Object.fromEntries(records.map(record => [record.recordId, { record }])) });
  return { schema:2, revision:1, domains:{ STORE:bucket(store), LEDGER:bucket([]), CALENDAR:bucket(calendar), RIDE:bucket([]) } };
}

test('Store projection ignores cancelled sales and reproduces delta-based stock truth', async () => {
  const { projectStore, projectMakeMoney } = await import('../ui/product-model.mjs');
  const store = [
    {recordId:'ADJ-1',type:'STOCK_ADJUSTMENT',quantity:7,status:'COMPLETED',createdAt:'2026-08-11T07:27:36.834Z'},
    {recordId:'SALE-1',type:'SALE',amountSatang:240000,quantity:2,status:'COMPLETED',createdAt:'2026-08-11T08:26:06.888Z'},
    {recordId:'SALE-2',type:'SALE',amountSatang:100000,quantity:1,status:'COMPLETED',createdAt:'2026-08-11T08:53:17.648Z'},
    {recordId:'WD-1',type:'STOCK_WITHDRAWAL',amountSatang:0,quantity:1,status:'COMPLETED',createdAt:'2026-08-11T13:30:48.727Z'},
    {recordId:'BUY-1',type:'PURCHASE',amountSatang:340000,quantity:10,status:'ACTIVE',createdAt:'2026-08-11T13:30:57.741Z'},
    {recordId:'SALE-CANCEL',type:'SALE',amountSatang:350000,quantity:5,status:'CANCELLED',createdAt:'2026-08-11T13:32:23.545Z'},
    {recordId:'ADJ-2',type:'STOCK_ADJUSTMENT',quantity:-8,status:'COMPLETED',createdAt:'2026-08-11T13:40:56.994Z'},
    {recordId:'SALE-3',type:'SALE',amountSatang:160000,quantity:2,status:'COMPLETED',createdAt:'2026-08-12T01:30:08.549Z'},
    {recordId:'SALE-4',type:'SALE',amountSatang:120000,quantity:1,status:'COMPLETED',createdAt:'2026-08-12T08:51:44.976Z'},
  ];
  const state = stateWith(store);
  const view = projectStore(state, '2026-08-12');
  assert.equal(view.stockQuantity, 2);
  assert.equal(view.todaySalesSatang, 280000);
  assert.equal(projectMakeMoney(state, '2026-08-11').storeSatang, 340000);
});

test('cancelled receive queue does not erase Store receivable truth', async () => {
  const { projectStore, projectStoreReceivables } = await import('../ui/product-model.mjs');
  const state = stateWith(
    [{recordId:'SALE-1',type:'SALE',title:'ขายสินค้า',totalSatang:100000,receivedSatang:0,outstandingSatang:100000,amountSatang:100000,quantity:1,status:'OPEN'}],
    [{recordId:'Q-1',type:'RECEIVE_CUSTOMER_PAYMENT',detail:'STORE/SALE-1',amountSatang:100000,dueDate:'2026-08-15',status:'CANCELLED'}],
  );
  assert.equal(projectStore(state, '2026-08-14').receivableSatang, 100000);
  const receivables = projectStoreReceivables(state);
  assert.equal(receivables.totalOutstandingSatang, 100000);
  assert.equal(receivables.items[0].queueState, 'UNSCHEDULED');
  assert.equal(receivables.items[0].queueId, null);
});

test('duplicate actionable receive queues are VERIFY_DUPLICATE instead of guessed', async () => {
  const { projectStoreReceivables } = await import('../ui/product-model.mjs');
  const state = stateWith(
    [{recordId:'SALE-1',type:'SALE',title:'ขายสินค้า',totalSatang:100000,receivedSatang:50000,outstandingSatang:50000,amountSatang:100000,quantity:1,status:'PARTIAL'}],
    [
      {recordId:'Q-A',type:'RECEIVE_CUSTOMER_PAYMENT',detail:'STORE/SALE-1',amountSatang:50000,status:'OPEN',dueDate:'2026-08-15'},
      {recordId:'Q-B',type:'RECEIVE_CUSTOMER_PAYMENT',detail:'STORE/SALE-1',amountSatang:50000,status:'PARTIAL',dueDate:'2026-08-16'},
    ],
  );
  const item = projectStoreReceivables(state).items[0];
  assert.equal(item.queueState, 'VERIFY_DUPLICATE');
  assert.equal(item.queueId, null);
});

test('partial Sale outstanding is counted exactly once from Sale source truth', async () => {
  const { projectStore, projectStoreReceivables } = await import('../ui/product-model.mjs');
  const state = stateWith(
    [{recordId:'SALE-1',type:'SALE',title:'ขายสินค้า',totalSatang:100000,receivedSatang:60000,outstandingSatang:40000,amountSatang:100000,quantity:1,status:'PARTIAL'}],
    [{recordId:'Q-1',type:'RECEIVE_CUSTOMER_PAYMENT',detail:'STORE/SALE-1',amountSatang:40000,status:'PARTIAL',dueDate:'2026-08-15'}],
  );
  assert.equal(projectStore(state, '2026-08-14').receivableSatang, 40000);
  const receivables = projectStoreReceivables(state);
  assert.equal(receivables.totalOutstandingSatang, 40000);
  assert.equal(receivables.items[0].queueState, 'SCHEDULED');
  assert.equal(receivables.items[0].queueId, 'Q-1');
});
