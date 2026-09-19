const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const contractUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-contract.mjs')).href;
const sessionUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-session.mjs')).href;
const at = '2026-09-19T02:00:00.000Z';

async function fixture() {
  const { createCentreBoard, createCentrePin } = await import(contractUrl);
  return createCentreBoard({
    boardId:'board-1',
    workId:'WORK-1',
    at,
    pins:[
      createCentrePin({ pinId:'pin-1', workId:'WORK-1', title:'First', status:'OPEN', at }),
      createCentrePin({ pinId:'pin-2', workId:'WORK-1', title:'Second', status:'OPEN', at }),
    ],
  });
}

test('entry claims pins and emits BOARD_READ receipt after readback', async () => {
  const { enterCentreBoard } = await import(sessionUrl);
  const board = await fixture();
  const output = enterCentreBoard(board, {
    receiptId:'read-1',
    workId:'WORK-1',
    employeeId:'GO-1',
    pinIds:['pin-1'],
    expectedRevision:1,
    at:'2026-09-19T02:01:00.000Z',
  });

  assert.equal(board.revision, 1, 'input board must remain unchanged');
  assert.equal(board.pins[0].status, 'OPEN');
  assert.equal(output.board.revision, 2);
  assert.equal(output.board.pins[0].status, 'DOING');
  assert.equal(output.board.pins[0].ownerEmployeeId, 'GO-1');
  assert.deepEqual(output.board.pins[0].touchedBy, ['GO-1']);
  assert.equal(output.board.pins[0].revision, 2);
  assert.equal(output.board.pins[1], board.pins[1]);
  assert.deepEqual(output.receipt, {
    receiptId:'read-1',
    type:'BOARD_READ',
    workId:'WORK-1',
    employeeId:'GO-1',
    beforeRevision:1,
    afterRevision:2,
    claimedPinIds:['pin-1'],
    readbackRevision:2,
    at:'2026-09-19T02:01:00.000Z',
  });
  assert.equal(Object.isFrozen(output.board), true);
  assert.equal(Object.isFrozen(output.receipt), true);
});

test('entry rejects stale revision, missing pin, and duplicate live Employee ID atomically', async () => {
  const { enterCentreBoard } = await import(sessionUrl);
  const board = await fixture();
  const raw = JSON.stringify(board);

  assert.throws(() => enterCentreBoard(board, {
    receiptId:'read-stale', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-1'], expectedRevision:0, at,
  }), /CENTRE_BOARD_REVISION_CONFLICT/);
  assert.throws(() => enterCentreBoard(board, {
    receiptId:'read-missing', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['missing'], expectedRevision:1, at,
  }), /CENTRE_BOARD_PIN_NOT_FOUND:missing/);

  const claimed = enterCentreBoard(board, {
    receiptId:'read-owner', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-1'], expectedRevision:1, at,
  }).board;
  assert.throws(() => enterCentreBoard(claimed, {
    receiptId:'read-duplicate', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-2'], expectedRevision:2, at,
  }), /CENTRE_BOARD_EMPLOYEE_ID_CONFLICT:GO-1/);
  assert.equal(JSON.stringify(board), raw);
});

test('entry receipt replay is idempotent and conflicting receipt reuse is rejected', async () => {
  const { enterCentreBoard } = await import(sessionUrl);
  const board = await fixture();
  const first = enterCentreBoard(board, {
    receiptId:'read-1', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-1'], expectedRevision:1, at,
  });
  const replay = enterCentreBoard(first.board, {
    receiptId:'read-1', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-1'], expectedRevision:1, at,
  });
  assert.deepEqual(replay, first);

  assert.throws(() => enterCentreBoard(first.board, {
    receiptId:'read-1', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-2'], expectedRevision:1, at,
  }), /CENTRE_BOARD_RECEIPT_ID_CONFLICT:read-1/);
});


test('return updates only claimed pins and emits BOARD_RETURN after readback', async () => {
  const { enterCentreBoard, returnCentreBoard } = await import(sessionUrl);
  const board = await fixture();
  const entered = enterCentreBoard(board, {
    receiptId:'read-return', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-1'], expectedRevision:1, at,
  });
  const output = returnCentreBoard(entered.board, {
    receiptId:'return-1',
    workId:'WORK-1',
    employeeId:'GO-1',
    expectedRevision:2,
    at:'2026-09-19T02:10:00.000Z',
    updates:[{
      pinId:'pin-1',
      status:'VERIFY',
      result:'Contract implemented',
      nextAction:'Verify CI',
      evidence:[{ type:'commit', ref:'abc123' }],
    }],
  });

  assert.equal(entered.board.revision, 2, 'input board must remain unchanged');
  assert.equal(entered.board.pins[0].status, 'DOING');
  assert.equal(output.board.revision, 3);
  assert.equal(output.board.pins[0].status, 'VERIFY');
  assert.equal(output.board.pins[0].result, 'Contract implemented');
  assert.equal(output.board.pins[0].nextAction, 'Verify CI');
  assert.deepEqual(output.board.pins[0].evidence, [{ type:'commit', ref:'abc123' }]);
  assert.equal(output.board.pins[0].revision, 3);
  assert.equal(output.receipt.type, 'BOARD_RETURN');
  assert.equal(output.receipt.beforeRevision, 2);
  assert.equal(output.receipt.afterRevision, 3);
  assert.equal(output.receipt.readbackRevision, 3);
  assert.deepEqual(output.receipt.updatedPinIds, ['pin-1']);
  assert.equal(Object.isFrozen(output.receipt), true);
});

test('return rejects stale, unclaimed, archived, and malformed updates atomically', async () => {
  const { enterCentreBoard, returnCentreBoard } = await import(sessionUrl);
  const board = await fixture();
  const entered = enterCentreBoard(board, {
    receiptId:'read-return', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-1'], expectedRevision:1, at,
  }).board;
  const raw = JSON.stringify(entered);
  const valid = {
    receiptId:'return-x', workId:'WORK-1', employeeId:'GO-1',
    expectedRevision:2, at,
    updates:[{
      pinId:'pin-1', status:'OPEN', result:'Paused',
      nextAction:'Continue later', evidence:[],
    }],
  };

  assert.throws(() => returnCentreBoard(entered, {
    ...valid, receiptId:'stale', expectedRevision:1,
  }), /CENTRE_BOARD_REVISION_CONFLICT/);
  assert.throws(() => returnCentreBoard(entered, {
    ...valid, receiptId:'unclaimed',
    updates:[{ ...valid.updates[0], pinId:'pin-2' }],
  }), /CENTRE_BOARD_PIN_NOT_CLAIMED:pin-2/);
  assert.throws(() => returnCentreBoard(entered, {
    ...valid, receiptId:'archived',
    updates:[{ ...valid.updates[0], status:'ARCHIVED' }],
  }), /CENTRE_BOARD_RETURN_STATUS_INVALID/);
  assert.throws(() => returnCentreBoard(entered, {
    ...valid, receiptId:'bad-evidence',
    updates:[{ ...valid.updates[0], evidence:{} }],
  }), /CENTRE_BOARD_EVIDENCE_INVALID/);
  assert.equal(JSON.stringify(entered), raw);
});

test('return receipt replay is idempotent and conflicting receipt reuse is rejected', async () => {
  const { enterCentreBoard, returnCentreBoard } = await import(sessionUrl);
  const board = await fixture();
  const entered = enterCentreBoard(board, {
    receiptId:'read-return', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-1'], expectedRevision:1, at,
  }).board;
  const request = {
    receiptId:'return-1', workId:'WORK-1', employeeId:'GO-1',
    expectedRevision:2, at,
    updates:[{
      pinId:'pin-1', status:'VERIFY', result:'Finished',
      nextAction:'Archive after verification', evidence:[],
    }],
  };
  const first = returnCentreBoard(entered, request);
  const replay = returnCentreBoard(first.board, request);
  assert.deepEqual(replay, first);
  assert.throws(() => returnCentreBoard(first.board, {
    ...request,
    updates:[{ ...request.updates[0], result:'Different' }],
  }), /CENTRE_BOARD_RECEIPT_ID_CONFLICT:return-1/);
});
