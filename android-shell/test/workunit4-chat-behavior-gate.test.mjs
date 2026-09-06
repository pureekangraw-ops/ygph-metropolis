import test from 'node:test';
import assert from 'node:assert/strict';

import { createConfirmedLedgerExecutor } from '../app/public/logic/chat/confirmed-ledger-executor.mjs';

test('confirmed generic income stays OTHER-owned and enters shared Manual Ledger addIncome path', async () => {
  const calls = [];
  const manual = {
    async addExpense() { throw new Error('EXPENSE_NOT_EXPECTED'); },
    async addIncome(payload) {
      calls.push(structuredClone(payload));
      return {
        status:'VERIFIED',
        readback:{
          recordId:payload.recordId,
          direction:'IN',
          subtype:'OTHER_INCOME',
          owner:'OTHER',
          amountSatang:payload.amountSatang,
        },
      };
    },
  };
  const execute = createConfirmedLedgerExecutor({ manual });

  const result = await execute({
    version:'1',
    requestId:'REQ-OTHER-42',
    action:'CREATE',
    object:'OTHER_INCOME',
    fields:{ title:'รายได้อื่น', amountSatang:50000 },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{
        owner:'OTHER',
        direction:'IN',
        subtype:'OTHER_INCOME',
        title:'รายได้อื่น',
        amountSatang:50000,
      },
    },
  });

  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(calls, [{
    workflowId:'WF-LH-REQ-OTHER-42',
    recordId:'TX-LH-REQ-OTHER-42',
    title:'รายได้อื่น',
    amountSatang:50000,
  }]);
  assert.equal(result.readback.owner, 'OTHER');
});

test('confirmed Store non-sale income stays STORE-owned and never invents a stock quantity', async () => {
  const calls = [];
  const manual = {
    async addExpense() { throw new Error('EXPENSE_NOT_EXPECTED'); },
    async storeIncome(payload) {
      calls.push(structuredClone(payload));
      return {
        status:'VERIFIED',
        readback:{
          owner:'STORE',
          storeIncomeId:payload.storeIncomeId,
          ledgerTransactionId:payload.ledgerTransactionId,
          amountSatang:payload.amountSatang,
        },
      };
    },
  };
  const execute = createConfirmedLedgerExecutor({ manual });

  const result = await execute({
    version:'1',
    requestId:'REQ-STORE-INCOME-42',
    action:'CREATE',
    object:'STORE_INCOME',
    fields:{ title:'เงินเข้าร้านอย่างอื่น', amountSatang:30000 },
    requiredResult:{
      kind:'STORE_INCOME_WITH_LEDGER',
      effect:{
        owner:'STORE',
        ledgerDirection:'IN',
        title:'เงินเข้าร้านอย่างอื่น',
        amountSatang:30000,
        stockEffect:'NONE',
      },
    },
  });

  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(calls, [{
    workflowId:'WF-LH-REQ-STORE-INCOME-42',
    storeIncomeId:'STORE-INCOME-LH-REQ-STORE-INCOME-42',
    ledgerTransactionId:'TX-LH-REQ-STORE-INCOME-42',
    title:'เงินเข้าร้านอย่างอื่น',
    amountSatang:30000,
  }]);
  assert.equal(Object.hasOwn(calls[0], 'quantity'), false);
  assert.equal(result.readback.owner, 'STORE');
});
