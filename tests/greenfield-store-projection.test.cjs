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

test('Store receivable projection comes from open Calendar receive queues, not optional Sale fields', async () => {
  const { projectStore } = await import('../ui/product-model.mjs');
  const state = stateWith(
    [{recordId:'SALE-OLD',type:'SALE',amountSatang:350000,quantity:5,status:'OPEN',createdAt:'2026-08-11T10:00:00Z'}],
    [
      {recordId:'Q-OPEN',type:'RECEIVE_CUSTOMER_PAYMENT',detail:'STORE/SALE-OLD',amountSatang:10000,dueDate:'2026-08-14',status:'OPEN'},
      {recordId:'Q-CANCEL',type:'RECEIVE_CUSTOMER_PAYMENT',detail:'STORE/SALE-X',amountSatang:50000,dueDate:'2026-08-14',status:'CANCELLED'},
    ],
  );
  assert.equal(projectStore(state, '2026-08-13').receivableSatang, 10000);
});
