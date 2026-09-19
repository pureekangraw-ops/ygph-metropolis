const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const storeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-store.mjs')).href;
const bridgeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-bridge.mjs')).href;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

async function fixture() {
  const { createLighthouseCentreBoardStore } = await import(storeUrl);
  const { createLighthouseCentreBoardBridge } = await import(bridgeUrl);
  const store = createLighthouseCentreBoardStore({
    storage:new MemoryStorage(),
    eventTarget:null,
  });
  const bridge = createLighthouseCentreBoardBridge({
    store,
    now:() => '2026-09-19T12:40:00.000Z',
  });
  bridge.initializeBoard({
    receiptId:'INIT-CIRCULATION',
    boardId:'BOARD-LIGHTHOUSE-CENTRE',
    workId:'WORK-LIGHTHOUSE-CENTRE-BOARD-CIRCULATION-20260919',
  });
  return bridge;
}

test('one live Centre Board can carry pins from different Work IDs without changing board authority', async () => {
  const bridge = await fixture();

  bridge.createPin({
    receiptId:'CREATE-WORK-A',
    workId:'WORK-A',
    expectedRevision:1,
    pin:{
      pinId:'PIN-WORK-A',
      title:'Work A',
      detail:'first circulating work',
      status:'OPEN',
      evidence:[],
      links:[],
    },
  });
  bridge.createPin({
    receiptId:'CREATE-WORK-B',
    workId:'WORK-B',
    expectedRevision:2,
    pin:{
      pinId:'PIN-WORK-B',
      title:'Work B',
      detail:'second circulating work',
      status:'OPEN',
      evidence:[],
      links:[],
    },
  });

  const board = bridge.readBoard();
  assert.equal(board.workId, 'WORK-LIGHTHOUSE-CENTRE-BOARD-CIRCULATION-20260919');
  assert.equal(board.revision, 3);
  assert.deepEqual(board.pins.map(pin => [pin.pinId, pin.workId]), [
    ['PIN-WORK-A', 'WORK-A'],
    ['PIN-WORK-B', 'WORK-B'],
  ]);
});

test('claim and return validate the selected Pin Work ID, not the Board authority Work ID', async () => {
  const bridge = await fixture();

  bridge.createPin({
    receiptId:'CREATE-WORK-A',
    workId:'WORK-A',
    expectedRevision:1,
    pin:{ pinId:'PIN-WORK-A', title:'Work A', evidence:[], links:[] },
  });
  bridge.createPin({
    receiptId:'CREATE-WORK-B',
    workId:'WORK-B',
    expectedRevision:2,
    pin:{ pinId:'PIN-WORK-B', title:'Work B', evidence:[], links:[] },
  });

  assert.throws(() => bridge.claimPins({
    receiptId:'CLAIM-WRONG-WORK',
    workId:'WORK-B',
    employeeId:'GO-WRONG',
    pinIds:['PIN-WORK-A'],
    expectedRevision:3,
  }), /CENTRE_BOARD_PIN_WORK_ID_MISMATCH:PIN-WORK-A/);

  const claimedA = bridge.claimPins({
    receiptId:'CLAIM-WORK-A',
    workId:'WORK-A',
    employeeId:'GO-ROOM-A',
    pinIds:['PIN-WORK-A'],
    expectedRevision:3,
  });
  assert.equal(claimedA.boardRevision, 4);
  assert.equal(bridge.readBoard().pins.find(pin => pin.pinId === 'PIN-WORK-A').status, 'DOING');

  const returnedA = bridge.returnPins({
    receiptId:'RETURN-WORK-A',
    workId:'WORK-A',
    employeeId:'GO-ROOM-A',
    expectedRevision:4,
    updates:[{
      pinId:'PIN-WORK-A',
      status:'VERIFY',
      result:'Work A returned with evidence',
      nextAction:'Verify Work A',
      evidence:[{ kind:'test', ref:'WORK-A-READBACK' }],
    }],
  });
  assert.equal(returnedA.boardRevision, 5);

  const claimedB = bridge.claimPins({
    receiptId:'CLAIM-WORK-B',
    workId:'WORK-B',
    employeeId:'GO-ROOM-B',
    pinIds:['PIN-WORK-B'],
    expectedRevision:5,
  });
  assert.equal(claimedB.boardRevision, 6);

  const returnedB = bridge.returnPins({
    receiptId:'RETURN-WORK-B',
    workId:'WORK-B',
    employeeId:'GO-ROOM-B',
    expectedRevision:6,
    updates:[{
      pinId:'PIN-WORK-B',
      status:'VERIFY',
      result:'Work B returned with evidence',
      nextAction:'Verify Work B',
      evidence:[{ kind:'test', ref:'WORK-B-READBACK' }],
    }],
  });

  const board = bridge.readBoard();
  assert.equal(returnedB.boardRevision, 7);
  assert.equal(board.revision, 7);
  assert.equal(board.workId, 'WORK-LIGHTHOUSE-CENTRE-BOARD-CIRCULATION-20260919');
  assert.deepEqual(board.pins.map(pin => [pin.workId, pin.status]), [
    ['WORK-A', 'VERIFY'],
    ['WORK-B', 'VERIFY'],
  ]);
  assert.equal(board.audit.at(-1).type, 'BOARD_RETURN');
  assert.equal(board.audit.at(-1).workId, 'WORK-B');
});
