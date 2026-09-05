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
