const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFileSync } = require('node:fs');

const boardContractUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-contract.mjs')).href;
const boardStoreUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-store.mjs')).href;
const controlPortUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/control-port.mjs')).href;
const registryUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/capability-registry.mjs')).href;
const goViewUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/go-board-live.mjs')).href;

function seedBoard(createCentreBoard) {
  return createCentreBoard({
    boardId:'BOARD-WORK-1',
    workId:'WORK-1',
    at:'2026-09-19T02:00:00.000Z',
    pins:[{
      pinId:'PIN-1',
      workId:'WORK-1',
      title:'เชื่อมบอร์ด',
      detail:'integration',
      status:'OPEN',
      at:'2026-09-19T02:00:00.000Z',
    }],
  });
}

test('Centre Board store persists claim/return readback and keeps emergency capsule on revision conflict', async () => {
  const { createCentreBoard } = await import(boardContractUrl);
  const { createCentreBoardStore, createMemoryCentreBoardStorage } = await import(boardStoreUrl);
  const storage = createMemoryCentreBoardStorage();
  const store = createCentreBoardStore({
    storage,
    now:() => '2026-09-19T02:10:00.000Z',
  });

  const initial = store.initialize(seedBoard(createCentreBoard));
  assert.equal(initial.revision, 1);

  const claimed = store.claim({
    receiptId:'RECEIPT-READ-1',
    workId:'WORK-1',
    employeeId:'GO-EMP-1',
    pinIds:['PIN-1'],
    expectedRevision:1,
    at:'2026-09-19T02:11:00.000Z',
  });
  assert.equal(claimed.status, 'VERIFIED');
  assert.equal(claimed.board.revision, 2);
  assert.equal(store.read().pins[0].ownerEmployeeId, 'GO-EMP-1');

  const capsule = store.deferReturn({
    capsuleId:'CAPSULE-1',
    workId:'WORK-1',
    employeeId:'GO-EMP-1',
    reason:'HUB_OFFLINE',
    claimedPinIds:['PIN-1'],
    pendingChanges:[{
      pinId:'PIN-1',
      status:'VERIFY',
      result:'งานเสร็จแล้ว',
      nextAction:'ตรวจหลักฐาน',
      evidence:[{ kind:'test', reference:'evidence-1' }],
    }],
    evidence:[{ kind:'route', reference:'offline' }],
    baseBoardRevision:2,
    at:'2026-09-19T02:12:00.000Z',
  });
  assert.equal(capsule.status, 'PENDING_RECOVERY');
  assert.equal(store.emergencyCapsules().length, 1);

  store.returnWork({
    receiptId:'RECEIPT-RETURN-OTHER',
    workId:'WORK-1',
    employeeId:'GO-EMP-1',
    expectedRevision:2,
    updates:[{
      pinId:'PIN-1',
      status:'DOING',
      result:'มีการเปลี่ยนแปลงก่อน recovery',
      nextAction:'ทำต่อ',
      evidence:[{ kind:'test', reference:'other-change' }],
    }],
    at:'2026-09-19T02:13:00.000Z',
  });
  assert.equal(store.read().revision, 3);

  const conflict = store.recover({
    capsuleId:'CAPSULE-1',
    receiptId:'RECEIPT-RECOVER-1',
    at:'2026-09-19T02:14:00.000Z',
  });
  assert.equal(conflict.status, 'CONFLICT');
  assert.equal(conflict.reason, 'CENTRE_BOARD_RECOVERY_CONFLICT');
  assert.equal(store.read().revision, 3);
  assert.equal(store.emergencyCapsules().length, 1, 'conflicted capsule must remain pending');
});

test('Control Port exposes board.read/claim/return/recover through the authoritative board store', async () => {
  const { createCentreBoard } = await import(boardContractUrl);
  const { createCentreBoardStore, createMemoryCentreBoardStorage } = await import(boardStoreUrl);
  const { createLighthouseControlPort, CONTROL_PORT_GUARD } = await import(controlPortUrl);
  const { getLighthouseCapability } = await import(registryUrl);

  const store = createCentreBoardStore({
    storage:createMemoryCentreBoardStorage(),
    now:() => '2026-09-19T02:20:00.000Z',
  });
  store.initialize(seedBoard(createCentreBoard));
  const port = createLighthouseControlPort({
    boardStore:store,
    withSession:async fn => fn({
      async readState() { return { revision:50, updatedAt:'2026-09-19T02:20:00.000Z', domains:{} }; },
    }),
    ledgerBridge:{},
    storeBridge:{},
    now:() => '2026-09-19T02:20:00.000Z',
  });

  for (const id of ['board.read','board.claim','board.return','board.recover']) {
    assert.ok(getLighthouseCapability(id), id + ' must be registered');
  }

  const read = await port.query({ capabilityId:'board.read' });
  assert.equal(read.status, 'OK');
  assert.equal(read.value.boardId, 'BOARD-WORK-1');
  assert.equal(read.revision, 1);

  const claimProposal = port.propose({
    requestId:'board-claim-1',
    capabilityId:'board.claim',
    payload:{
      receiptId:'RECEIPT-READ-CP',
      workId:'WORK-1',
      employeeId:'GO-EMP-CP',
      pinIds:['PIN-1'],
      expectedRevision:1,
      at:'2026-09-19T02:21:00.000Z',
    },
  });
  assert.equal(claimProposal.guard, CONTROL_PORT_GUARD.DIRECT);
  const claimed = await port.commit(claimProposal);
  assert.equal(claimed.status, 'VERIFIED');
  assert.equal(claimed.afterRevision, 2);
  assert.equal(claimed.evidence.receipt.type, 'BOARD_READ');

  const returned = await port.commit(port.propose({
    requestId:'board-return-1',
    capabilityId:'board.return',
    payload:{
      receiptId:'RECEIPT-RETURN-CP',
      workId:'WORK-1',
      employeeId:'GO-EMP-CP',
      expectedRevision:2,
      updates:[{
        pinId:'PIN-1',
        status:'VERIFY',
        result:'พร้อมตรวจ',
        nextAction:'verify',
        evidence:[{ kind:'test', reference:'cp-return' }],
      }],
      at:'2026-09-19T02:22:00.000Z',
    },
  }));
  assert.equal(returned.status, 'VERIFIED');
  assert.equal(returned.afterRevision, 3);
  assert.equal(returned.evidence.receipt.type, 'BOARD_RETURN');
});

test('GO live projection reads exact Board V1 pin ownership and signals emergency capsules', async () => {
  const { createGoBoardView } = await import(goViewUrl);
  const view = createGoBoardView({
    hubStatus:{ pairing:{status:'PAIRED'}, realtime:{status:'LIVE'}, report:{transport:'ONLINE'} },
    runtimeState:{
      work:{ nextAction:'WAITING_COMMAND', pendingRequestId:null, blocker:null },
      inbox:{},
      outbox:{},
    },
    snapshotStatus:{ freshness:'LIVE', revision:77, updatedAt:'2026-09-19T02:30:00.000Z' },
    board:{
      boardId:'BOARD-WORK-1',
      workId:'WORK-1',
      revision:4,
      updatedAt:'2026-09-19T02:29:00.000Z',
      pins:[{
        pinId:'PIN-1',
        workId:'WORK-1',
        title:'งานสด',
        status:'DOING',
        ownerEmployeeId:'GO-EMP-9',
        touchedBy:['GO-EMP-9'],
        revision:2,
      }],
    },
    emergencyCapsules:[],
  });
  assert.equal(view.route.mode, 'LIVE');
  assert.equal(view.truth.boardRevision, 4);
  assert.equal(view.work.employeeId, 'GO-EMP-9');
  assert.equal(view.work.pinId, 'PIN-1');

  const emergency = createGoBoardView({
    hubStatus:{ pairing:{status:'PAIRED'}, report:{transport:'ONLINE'} },
    runtimeState:{ work:{nextAction:'WAITING_COMMAND'}, inbox:{}, outbox:{} },
    snapshotStatus:{ freshness:'LIVE' },
    board:null,
    emergencyCapsules:[{ capsuleId:'CAP-1', status:'PENDING_RECOVERY' }],
  });
  assert.equal(emergency.route.mode, 'EMERGENCY');
  assert.equal(emergency.emergency.count, 1);
});

test('LIGHTHOUSE GO page is a fourth root wired to board store truth, not a UI truth copy', () => {
  const html = readFileSync(path.resolve(__dirname, '../lighthouse-next/index.html'), 'utf8');
  const app = readFileSync(path.resolve(__dirname, '../lighthouse-next/app.mjs'), 'utf8');
  const projection = readFileSync(path.resolve(__dirname, '../lighthouse-next/go-board-live.mjs'), 'utf8');
  const css = readFileSync(path.resolve(__dirname, '../lighthouse-next/go-board-live.css'), 'utf8');

  assert.match(html, /id="page-go"[^>]+data-root="go"/);
  assert.match(html, /data-root-target="go"/);
  assert.match(app, /createCentreBoardStore\(\{ storage:localStorage \}\)/);
  assert.match(app, /createLighthouseControlPort\(\{ ledgerBridge, storeBridge, boardStore \}\)/);
  assert.match(app, /const allowed = \['chat','manual','go','settings'\]/);
  assert.match(app, /boardStore\.read\(\)/);
  assert.match(app, /boardStore\.emergencyCapsules\(\)/);
  assert.match(css, /grid-template-columns:repeat\(4,1fr\)/);
  assert.doesNotMatch(projection, /localStorage|sessionStorage|indexedDB/i);
});
