import test from 'node:test';
import assert from 'node:assert/strict';

import { createTrustedBrainAdapter } from '../www/trusted/brain-adapter.mjs';

function adapterFixture() {
  let requestId = 0;
  const sideQueryHandler = async rawText => {
    if (rawText !== 'พรุ่งนี้ฝนตกไหม') return null;
    return {
      status:'SUCCESS',
      readback:{
        interactionStatus:'SIDE_QUERY_ANSWERED',
        message:'พรุ่งนี้มีโอกาสฝนตก',
      },
    };
  };

  return createTrustedBrainAdapter({
    routeMasterInputText:async () => { throw new Error('UNEXPECTED_FRESH_ROUTE'); },
    createRecoverySession:() => ({}),
    applySessionOwnerInput:() => ({}),
    rejoinRecoverySession:async () => ({}),
    pathKernel:{
      preflight:() => ({ status:'READY' }),
      run:async () => ({ status:'COMPLETE', readback:{} }),
    },
    requestPreflight:() => ({ status:'READY' }),
    withRuntimeSession:async callback => callback({
      readState:async () => ({ revision:0, domains:{ RIDE:{ records:{} } } }),
    }),
    requestIdFactory:() => `REQ-${++requestId}`,
    inputIdFactory:() => 'INPUT-1',
    receivedAt:() => '2026-09-06T08:00:00.000Z',
    timeZone:'Asia/Bangkok',
    sideQueryHandler,
  });
}

test('pending income hands a non-mutation side query off without replacing the original 500 state', async () => {
  const adapter = adapterFixture();

  const pending = await adapter.send('วันนี้ได้ 500');
  assert.equal(pending.status, 'SUCCESS');
  assert.equal(pending.readback.interactionStatus, 'CLARIFICATION_REQUIRED');

  const side = await adapter.send('พรุ่งนี้ฝนตกไหม');
  assert.equal(side.status, 'SUCCESS');
  assert.equal(side.readback.interactionStatus, 'SIDE_QUERY_ANSWERED');
  assert.equal(side.readback.message, 'พรุ่งนี้มีโอกาสฝนตก');

  const resumed = await adapter.send('ร้าน');
  assert.equal(resumed.status, 'SUCCESS');
  assert.equal(resumed.readback.interactionStatus, 'CLARIFICATION_REQUIRED');
  assert.match(resumed.readback.message, /ขายสินค้า/);
  assert.match(resumed.readback.message, /เงินเข้าร้านอย่างอื่น/);
});
