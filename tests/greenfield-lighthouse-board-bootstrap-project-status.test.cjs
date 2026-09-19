const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const storeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-store.mjs')).href;
const bridgeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-bridge.mjs')).href;
const statusUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/project-status-envelope.mjs')).href;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('Board bootstrap initializes once, readbacks revision 1, and supports idempotent replay', async () => {
  const { createLighthouseCentreBoardStore } = await import(storeUrl);
  const { createLighthouseCentreBoardBridge } = await import(bridgeUrl);
  const store = createLighthouseCentreBoardStore({ storage:new MemoryStorage(), eventTarget:null });
  const bridge = createLighthouseCentreBoardBridge({
    store,
    now:() => '2026-09-19T05:40:00.000Z',
  });

  const first = bridge.initializeBoard({
    receiptId:'INIT-BOARD-1',
    boardId:'BOARD-LIGHTHOUSE',
    workId:'WORK-PROJECT-STATUS',
  });
  assert.equal(first.status, 'VERIFIED');
  assert.equal(first.initialized, true);
  assert.equal(first.boardRevision, 1);
  assert.equal(first.receipt.type, 'BOARD_INITIALIZE');
  assert.equal(bridge.readBoard().audit[0].type, 'BOARD_INITIALIZE');

  const replay = bridge.initializeBoard({
    receiptId:'INIT-BOARD-1',
    boardId:'BOARD-LIGHTHOUSE',
    workId:'WORK-PROJECT-STATUS',
  });
  assert.equal(replay.status, 'VERIFIED');
  assert.equal(replay.initialized, false);
  assert.equal(replay.replay, true);
  assert.equal(replay.boardRevision, 1);

  assert.throws(() => bridge.initializeBoard({
    receiptId:'INIT-BOARD-2',
    boardId:'BOARD-OTHER',
    workId:'WORK-OTHER',
  }), /CENTRE_BOARD_ALREADY_INITIALIZED/);
});

test('Pin create uses Board revision/readback and replays the same receipt without duplicate pin', async () => {
  const { createLighthouseCentreBoardStore } = await import(storeUrl);
  const { createLighthouseCentreBoardBridge } = await import(bridgeUrl);
  const store = createLighthouseCentreBoardStore({ storage:new MemoryStorage(), eventTarget:null });
  const bridge = createLighthouseCentreBoardBridge({
    store,
    now:() => '2026-09-19T05:41:00.000Z',
  });

  bridge.initializeBoard({
    receiptId:'INIT-PIN-BOARD',
    boardId:'BOARD-PIN',
    workId:'WORK-PIN',
  });
  const created = bridge.createPin({
    receiptId:'CREATE-PIN-1',
    workId:'WORK-PIN',
    expectedRevision:1,
    pin:{
      pinId:'PIN-SYSTEM-MAP',
      title:'SYSTEM SPACE MAP',
      detail:'หนึ่งข้อมูลมีบ้านหลักหนึ่งที่ ที่อื่นเก็บ Reference',
      status:'OPEN',
      evidence:[],
      links:[],
    },
  });

  assert.equal(created.status, 'VERIFIED');
  assert.equal(created.created, true);
  assert.equal(created.boardRevision, 2);
  assert.equal(created.receipt.type, 'BOARD_PIN_CREATE');
  assert.equal(bridge.readBoard().pins.length, 1);
  assert.equal(bridge.readBoard().pins[0].status, 'OPEN');

  const replay = bridge.createPin({
    receiptId:'CREATE-PIN-1',
    workId:'WORK-PIN',
    expectedRevision:1,
    pin:{
      pinId:'PIN-SYSTEM-MAP',
      title:'SYSTEM SPACE MAP',
      detail:'หนึ่งข้อมูลมีบ้านหลักหนึ่งที่ ที่อื่นเก็บ Reference',
      status:'OPEN',
      evidence:[],
      links:[],
    },
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.boardRevision, 2);
  assert.equal(bridge.readBoard().pins.length, 1);
  assert.throws(() => bridge.createPin({
    receiptId:'CREATE-PIN-1',
    workId:'WORK-PIN',
    expectedRevision:1,
    pin:{ pinId:'PIN-SYSTEM-MAP', title:'changed payload', status:'OPEN' },
  }), /CENTRE_BOARD_RECEIPT_ID_CONFLICT/);

  assert.throws(() => bridge.createPin({
    receiptId:'CREATE-PIN-2',
    workId:'WORK-PIN',
    expectedRevision:2,
    pin:{ pinId:'PIN-SYSTEM-MAP', title:'duplicate', status:'OPEN' },
  }), /CENTRE_BOARD_PIN_ID_CONFLICT/);
});

test('Project Status Envelope keeps one common shape and one optional source-personality detail object', async () => {
  const { createProjectStatusEnvelope, createProjectStatusProjection } = await import(statusUrl);

  const emptyDetail = createProjectStatusEnvelope({
    projectId:'LIGHTHOUSE',
    source:'drive',
    status:'IDLE',
    sourceStatus:null,
    title:'Drive',
    freshness:'UNKNOWN',
    detail:null,
  });
  assert.equal(emptyDetail.detail, null);

  const github = createProjectStatusEnvelope({
    projectId:'LIGHTHOUSE',
    source:'github',
    status:'ACTIVE',
    sourceStatus:'SOURCE_COMMIT',
    title:'GitHub',
    freshness:'UNKNOWN',
    detail:{ repo:'ygph-metropolis', sha:'abc123' },
  });
  assert.deepEqual(github.detail, { repo:'ygph-metropolis', sha:'abc123' });

  const projection = createProjectStatusProjection({
    projectId:'LIGHTHOUSE',
    buildIdentity:{
      sourceRepository:'pureekangraw-ops/ygph-metropolis',
      sourceRef:'main',
      sourceCommit:'a7c822fd96b00aadde44b8621c85f260e142ecc2',
      versionName:'1.0.0-owner.10',
      versionCode:1015,
    },
    boardState:{
      boardId:'BOARD-LIGHTHOUSE',
      workId:'WORK-PROJECT-STATUS',
      revision:2,
      updatedAt:'2026-09-19T05:42:00.000Z',
      pins:[{
        pinId:'PIN-SYSTEM-MAP',
        title:'SYSTEM SPACE MAP',
        status:'OPEN',
        ownerEmployeeId:null,
        nextAction:null,
        updatedAt:'2026-09-19T05:42:00.000Z',
      }],
    },
    circulationState:{ active:{}, updatedAt:'2026-09-19T05:42:00.000Z' },
    snapshotStatus:{ freshness:'LIVE', updatedAt:'2026-09-19T05:42:00.000Z' },
    routeMode:'LIVE',
  });

  assert.equal(projection.status, 'ACTIVE');
  assert.deepEqual(projection.sources.map(item => item.source), ['github','board','lighthouse']);
  assert.equal(projection.sources.some(item => item.source === 'factory'), false);
  assert.equal(projection.sources.some(item => item.source === 'drive'), false);
  assert.equal(projection.sources.find(item => item.source === 'board').detail.workId, 'WORK-PROJECT-STATUS');
});

test('GO UI wires Project Status as a read-only projection and Board bootstrap routes through Control Port', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'lighthouse-next', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'lighthouse-next', 'app.mjs'), 'utf8');
  const core = fs.readFileSync(path.join(root, 'lighthouse-next', 'control-port', 'control-port.mjs'), 'utf8');
  const stage = fs.readFileSync(path.join(root, 'scripts', 'stage-lighthouse-next-bundle.mjs'), 'utf8');

  assert.match(html, /id="go-project-sources"/);
  assert.match(html, /หนึ่งภาพรวม · หลายระบบ/);
  assert.match(app, /createProjectStatusProjection/);
  assert.match(app, /renderProjectStatus/);
  assert.match(core, /case 'board\.initialize'/);
  assert.match(core, /case 'pin\.create'/);
  assert.match(core, /initializeBoard/);
  assert.match(core, /createPin/);
  assert.match(stage, /'centre-board\/board-bootstrap\.mjs'/);
  assert.match(stage, /'project-status-envelope\.mjs'/);
  assert.doesNotMatch(app, /PROJECT_STATUS_STORAGE|projectStatusStore|localStorage\.setItem\([^)]*project/i);
});
