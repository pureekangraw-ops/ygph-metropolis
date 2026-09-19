const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFileSync } = require('node:fs');

const boardUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-contract.mjs')).href;
const sessionUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-session.mjs')).href;
const storeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-store.mjs')).href;
const bridgeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-bridge.mjs')).href;
const emergencyUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/emergency-capsule.mjs')).href;
const viewUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/go-board-live.mjs')).href;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('Centre Board local store persists only contract-valid snapshots with revision readback', async () => {
  const { createCentreBoard, createCentrePin } = await import(boardUrl);
  const { enterCentreBoard } = await import(sessionUrl);
  const { createLighthouseCentreBoardStore } = await import(storeUrl);
  const storage = new MemoryStorage();
  const store = createLighthouseCentreBoardStore({ storage, eventTarget:null });

  const at = '2026-09-19T04:00:00.000Z';
  const board = createCentreBoard({
    boardId:'board-live-1',
    workId:'WORK-LIVE-1',
    at,
    pins:[createCentrePin({
      pinId:'pin-live-1',
      workId:'WORK-LIVE-1',
      title:'เชื่อมหน้า GO',
      status:'OPEN',
      at,
    })],
  });
  const initial = store.write(board, { expectedRevision:0 });
  assert.equal(initial.revision, 1);
  assert.equal(store.read().pins[0].status, 'OPEN');

  const entered = enterCentreBoard(initial, {
    receiptId:'read-live-1',
    workId:'WORK-LIVE-1',
    employeeId:'GO-EMP-1',
    pinIds:['pin-live-1'],
    expectedRevision:1,
    at:'2026-09-19T04:01:00.000Z',
  }).board;
  const saved = store.write(entered, { expectedRevision:1 });
  assert.equal(saved.revision, 2);
  assert.equal(saved.pins[0].status, 'DOING');
  assert.equal(saved.pins[0].ownerEmployeeId, 'GO-EMP-1');

  assert.throws(() => store.write(entered, { expectedRevision:1 }), /CENTRE_BOARD_REVISION_CONFLICT/);
});

test('Centre Board bridge claims, returns, and recovers through revision-checked local truth', async () => {
  const { createCentreBoard, createCentrePin } = await import(boardUrl);
  const { createLighthouseCentreBoardStore } = await import(storeUrl);
  const { createLighthouseCentreBoardBridge } = await import(bridgeUrl);
  const { createEmergencyCapsule } = await import(emergencyUrl);
  const storage = new MemoryStorage();
  const store = createLighthouseCentreBoardStore({ storage, eventTarget:null });
  const bridge = createLighthouseCentreBoardBridge({
    store,
    now:() => '2026-09-19T04:10:00.000Z',
  });

  const board = createCentreBoard({
    boardId:'board-bridge-1',
    workId:'WORK-BRIDGE-1',
    at:'2026-09-19T04:00:00.000Z',
    pins:[createCentrePin({
      pinId:'pin-bridge-1',
      workId:'WORK-BRIDGE-1',
      title:'Bridge',
      status:'OPEN',
      at:'2026-09-19T04:00:00.000Z',
    })],
  });
  store.write(board, { expectedRevision:0 });

  const claimed = bridge.claimPins({
    receiptId:'claim-1',
    workId:'WORK-BRIDGE-1',
    employeeId:'GO-BRIDGE-1',
    pinIds:['pin-bridge-1'],
    expectedRevision:1,
  });
  assert.equal(claimed.status, 'VERIFIED');
  assert.equal(claimed.boardRevision, 2);
  assert.equal(claimed.receipt.type, 'BOARD_READ');
  assert.equal(bridge.readBoard().pins[0].ownerEmployeeId, 'GO-BRIDGE-1');

  const returned = bridge.returnPins({
    receiptId:'return-1',
    workId:'WORK-BRIDGE-1',
    employeeId:'GO-BRIDGE-1',
    expectedRevision:2,
    updates:[{
      pinId:'pin-bridge-1',
      status:'VERIFY',
      result:'Done',
      nextAction:'Verify',
      evidence:[{ type:'commit', ref:'abc' }],
    }],
  });
  assert.equal(returned.status, 'VERIFIED');
  assert.equal(returned.boardRevision, 3);
  assert.equal(returned.receipt.type, 'BOARD_RETURN');

  const capsule = createEmergencyCapsule({
    capsuleId:'capsule-bridge-1',
    workId:'WORK-BRIDGE-1',
    employeeId:'GO-BRIDGE-1',
    reason:'HUB_OFFLINE',
    baseBoardRevision:3,
    claimedPinIds:['pin-bridge-1'],
    pendingChanges:[{
      pinId:'pin-bridge-1',
      status:'PENDING_RECOVERY',
      result:'Paused for recovery',
      nextAction:'Resume',
      evidence:[],
    }],
    evidence:[],
    at:'2026-09-19T04:11:00.000Z',
  });
  const recovered = bridge.recoverEmergency({
    capsule,
    receiptId:'recover-1',
    at:'2026-09-19T04:12:00.000Z',
  });
  assert.equal(recovered.status, 'VERIFIED');
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.boardRevision, 4);
  assert.equal(recovered.receipt.type, 'RECOVERY');
  assert.equal(bridge.readBoard().pins[0].status, 'PENDING_RECOVERY');
});

test('GO live projection uses Centre Board V1 Work ID, Employee ID, pins and route truth', async () => {
  const { createGoBoardView } = await import(viewUrl);
  const boardState = {
    schemaVersion:1,
    boardId:'board-live-1',
    workId:'WORK-LIVE-1',
    revision:9,
    updatedAt:'2026-09-19T04:05:00.000Z',
    audit:[],
    pins:[{
      pinId:'pin-1',
      workId:'WORK-LIVE-1',
      title:'Realtime board',
      detail:'monitor',
      status:'PENDING_RECOVERY',
      ownerEmployeeId:'GO-EMP-9',
      touchedBy:['GO-EMP-9'],
      result:'Hub offline',
      nextAction:'Recover route',
      evidence:[],
      links:[],
      revision:3,
      createdAt:'2026-09-19T04:00:00.000Z',
      updatedAt:'2026-09-19T04:05:00.000Z',
    }],
  };
  const view = createGoBoardView({
    hubStatus:{
      pairing:{ status:'PAIRED' },
      realtime:{ status:'LIVE' },
      report:{ transport:'ONLINE' },
    },
    runtimeState:{
      work:{
        pendingRequestId:'request-2',
        blocker:'CONFIRMATION_REQUIRED',
        nextAction:'AWAIT_CONFIRMATION',
        lastSuccessfulReadback:{ requestId:'request-1', capabilityId:'finance.income.create', revision:24 },
      },
      inbox:{
        pending:{ requestId:'request-2', capabilityId:'finance.expense.create', status:'CONFIRMATION_REQUIRED', owner:'GREENFIELD:LEDGER' },
      },
      outbox:{ done:{ requestId:'request-1', status:'DONE' } },
    },
    snapshotStatus:{ freshness:'LIVE', revision:24 },
    boardState,
  });

  assert.equal(view.route.mode, 'LIVE');
  assert.equal(view.work.boardId, 'board-live-1');
  assert.equal(view.work.workId, 'WORK-LIVE-1');
  assert.equal(view.work.employeeId, 'GO-EMP-9');
  assert.equal(view.work.pinId, 'pin-1');
  assert.equal(view.work.pinStatus, 'PENDING_RECOVERY');
  assert.equal(view.work.nextAction, 'Recover route');
  assert.equal(view.board.revision, 9);
  assert.equal(view.board.recovery, 1);
  assert.equal(view.queue.confirmations, 1);
});

test('GO live view derives fallback, emergency and recovery without inventing successful state', async () => {
  const { createGoBoardView } = await import(viewUrl);

  assert.equal(createGoBoardView({
    hubStatus:{ pairing:{ status:'PAIRED' }, report:{ transport:'ONLINE' } },
    runtimeState:{ work:{ nextAction:'WAITING_COMMAND' }, inbox:{}, outbox:{} },
    snapshotStatus:{ freshness:'LIVE' },
  }).route.mode, 'FALLBACK');

  assert.equal(createGoBoardView({
    hubStatus:{ pairing:{ status:'PAIRED' }, report:{ transport:'OFFLINE' } },
    runtimeState:{ work:{ nextAction:'WAITING_COMMAND' }, inbox:{ x:{ requestId:'x', status:'PROCESSING' } }, outbox:{} },
    snapshotStatus:{ freshness:'STALE' },
  }).route.mode, 'EMERGENCY');

  assert.equal(createGoBoardView({
    hubStatus:{ pairing:{ status:'PAIRED' }, realtime:{ status:'RECONNECT_WAIT' } },
    runtimeState:{ work:{ nextAction:'WAITING_COMMAND' }, inbox:{}, outbox:{} },
  }).route.mode, 'RECOVERY');
});

test('GO is a fourth LIGHTHOUSE root wired to Centre Board local working memory and existing Control Port', () => {
  const html = readFileSync(path.resolve(__dirname, '../lighthouse-next/index.html'), 'utf8');
  const app = readFileSync(path.resolve(__dirname, '../lighthouse-next/app.mjs'), 'utf8');
  const css = readFileSync(path.resolve(__dirname, '../lighthouse-next/go-board-live.css'), 'utf8');
  const shellCss = readFileSync(path.resolve(__dirname, '../lighthouse-next/styles.css'), 'utf8');
  const stage = readFileSync(path.resolve(__dirname, '../scripts/stage-lighthouse-next-bundle.mjs'), 'utf8');
  const packageJson = require('../package.json');

  assert.match(html, /id="page-go"[^>]+data-root="go"/);
  assert.match(html, /data-root-target="go"/);
  assert.match(html, /id="go-board-list"/);
  assert.match(html, /Centre Board V1/);
  assert.match(app, /createLighthouseCentreBoardStore\(\)/);
  assert.match(app, /const allowed = \['chat','manual','go','settings'\]/);
  assert.match(app, /activeRoot:\['chat','manual','go','settings'\]\.includes/);
  assert.match(app, /controlPortRuntime\.snapshotStatus\(\)/);
  assert.match(app, /lighthouse:centre-board/);
  assert.match(shellCss, /grid-template-columns:repeat\(4,1fr\)/);
  assert.match(packageJson.scripts['check:syntax'], /lighthouse-next\/centre-board\/board-store\.mjs/);
  assert.match(packageJson.scripts['check:syntax'], /lighthouse-next\/go-board-live\.mjs/);
  assert.match(stage, /'go-board-live\.css'/);
  assert.match(stage, /'centre-board\/board-contract\.mjs'/);
  assert.match(stage, /'centre-board\/board-session\.mjs'/);
  assert.match(stage, /'centre-board\/emergency-capsule\.mjs'/);
  assert.match(stage, /'centre-board\/board-store\.mjs'/);
  assert.match(stage, /'go-board-live\.mjs'/);
  assert.match(stage, /roots:\['CHAT','MANUAL','GO','SETTINGS'\]/);
});
