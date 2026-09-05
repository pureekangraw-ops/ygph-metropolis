import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareIntentPath } from '../../lighthouse/intent-path-adapter.mjs';

test('explicit Store sale text prepares a STORE_SALE request without mutating anything', () => {
  const prepared = prepareIntentPath('ขายสบู่ 1 กล่อง 500 บาท', {
    requestIdFactory:() => 'REQ-STORE-TEXT-1',
    receivedAt:'2026-09-05T15:10:00.000Z',
    timeZone:'Asia/Bangkok',
  });

  assert.equal(prepared.status, 'READY');
  assert.equal(prepared.request.object, 'STORE_SALE');
  assert.deepEqual(prepared.request.fields, {
    title:'สบู่',
    amountSatang:50000,
    quantity:1,
    receivedSatang:50000,
  });
  assert.deepEqual(prepared.request.requiredResult, {
    kind:'STORE_SALE_WITH_LEDGER',
    effect:{
      owner:'STORE',
      ledgerDirection:'IN',
      title:'สบู่',
      amountSatang:50000,
      quantity:1,
      receivedSatang:50000,
    },
  });
});
