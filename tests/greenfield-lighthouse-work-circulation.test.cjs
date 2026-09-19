const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const boardUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-contract.mjs')).href;
const storeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-store.mjs')).href;
const bridgeUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-bridge.mjs')).href;
const emergencyUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/emergency-capsule.mjs')).href;
const circulationUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/work-circulation.mjs')).href;
const viewUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/go-board-live.mjs')).href;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

async function fixture({ workId = 'WORK-CIRC-1', pinId = 'PIN-CIRC-1' } = {}) {
  const { createCentreBoard, createCentrePin } = await import(boardUrl);
  const { createLighthouseCentreBoardStore } = await import(storeUrl);
  const { createLighthouseCentreBoardBridge } = await import(bridgeUrl);
  const { createLighthouseWorkCirculation } = await import(circulationUrl);
  const storage = new MemoryStorage();
  const boardStore = createLighthouseCentreBoardStore({ storage, eventTarget:null });
  boardStore.write(createCentreBoard({
    boardId:'BOARD-' + workId,
    workId,
    at:'2026-09-19T05:00:00.000Z',
    pins:[createCentrePin({
      pinId,
      workId,
      title:'งานหมุนเวียน',
      status:'OPEN',
      at:'2026-09-19T05:00:00.000Z',
    })],
  }), { expectedRevision:0 });
  const bridge = createLighthouseCentreBoardBridge({
    store:boardStore,
    now:() => '2026-09-19T05:01:00.000Z',
  });
  const circulation = createLighthouseWorkCirculation({
    boardBridge:bridge,
    storage,
    now:() => '2026-09-19T05:01:00.000Z',
    eventTarget:null,
  });
  return { storage, boardStore, bridge, circulation, workId, pinId };
}

test('LIGHTHOUSE claim creates a durable working ticket and verified return closes it', async () => {
  const fx = await fixture();
  const claimed = fx.circulation.claimPins({
    receiptId:'CLAIM-CIRC-1',
    workId:fx.workId,
    employeeId:'GO-CIRC-1',
    pinIds:[fx.pinId],
    expectedRevision:1,
    at:'2026-09-19T05:02:00.000Z',
  });

  assert.equal(claimed.status, 'VERIFIED');
  assert.equal(claimed.boardRevision, 2);
  assert.equal(claimed.circulation.ticket.status, 'ACTIVE');
  assert.equal(claimed.circulation.ticket.workId, fx.workId);
  assert.deepEqual(claimed.circulation.ticket.pinIds, [fx.pinId]);

  const { createLighthouseWorkCirculation } = await import(circulationUrl);
  const reloaded = createLighthouseWorkCirculation({
    boardBridge:fx.bridge,
    storage:fx.storage,
    now:() => '2026-09-19T05:03:00.000Z',
    eventTarget:null,
  });
  assert.equal(reloaded.activeTickets().length, 1, 'working ticket must survive app/runtime restart');

  const returned = reloaded.returnPins({
    receiptId:'RETURN-CIRC-1',
    workId:fx.workId,
    employeeId:'GO-CIRC-1',
    expectedRevision:2,
    updates:[{
      pinId:fx.pinId,
      status:'VERIFY',
      result:'Factory finished the work',
      nextAction:'verify evidence',
      evidence:[{ kind:'factory', reference:'build-1' }],
    }],
    at:'2026-09-19T05:04:00.000Z',
  });

  assert.equal(returned.status, 'VERIFIED');
  assert.equal(returned.boardRevision, 3);
  assert.equal(reloaded.activeTickets().length, 0);
  assert.equal(reloaded.history().length, 1);
  assert.equal(reloaded.history()[0].status, 'RETURNED');
  assert.equal(fx.bridge.readBoard().pins[0].status, 'VERIFY');
});

test('Emergency Capsule keeps a circulation ticket in RECOVERY on revision conflict', async () => {
  const fx = await fixture({ workId:'WORK-CIRC-EMERGENCY', pinId:'PIN-CIRC-EMERGENCY' });
  const { createEmergencyCapsule } = await import(emergencyUrl);

  fx.circulation.claimPins({
    receiptId:'CLAIM-CIRC-E',
    workId:fx.workId,
    employeeId:'GO-CIRC-E',
    pinIds:[fx.pinId],
    expectedRevision:1,
    at:'2026-09-19T05:10:00.000Z',
  });

  const capsule = createEmergencyCapsule({
    capsuleId:'CAP-CIRC-E',
    workId:fx.workId,
    employeeId:'GO-CIRC-E',
    reason:'HUB_OFFLINE',
    baseBoardRevision:2,
    claimedPinIds:[fx.pinId],
    pendingChanges:[{
      pinId:fx.pinId,
      status:'VERIFY',
      result:'offline result',
      nextAction:'recover',
      evidence:[{ kind:'factory', reference:'offline-build' }],
    }],
    evidence:[{ kind:'route', reference:'offline' }],
    at:'2026-09-19T05:11:00.000Z',
  });
  fx.circulation.stageEmergency(capsule);
  assert.equal(fx.circulation.activeTickets()[0].status, 'RECOVERY');
  assert.equal(fx.boardStore.readEmergencyCapsules().length, 1);

  fx.bridge.returnPins({
    receiptId:'RETURN-CIRC-NEWER',
    workId:fx.workId,
    employeeId:'GO-CIRC-E',
    expectedRevision:2,
    updates:[{
      pinId:fx.pinId,
      status:'DOING',
      result:'newer live change',
      nextAction:'continue',
      evidence:[{ kind:'route', reference:'live-change' }],
    }],
    at:'2026-09-19T05:12:00.000Z',
  });

  assert.throws(() => fx.circulation.recoverEmergency({
    capsuleId:'CAP-CIRC-E',
    receiptId:'RECOVER-CIRC-E',
    at:'2026-09-19T05:13:00.000Z',
  }), /CENTRE_BOARD_RECOVERY_CONFLICT/);

  assert.equal(fx.circulation.activeTickets()[0].status, 'RECOVERY');
  assert.equal(fx.circulation.activeTickets()[0].emergencyCapsuleId, 'CAP-CIRC-E');
  assert.equal(fx.boardStore.readEmergencyCapsules().length, 1, 'conflict must keep capsule durable');
  assert.equal(fx.bridge.readBoard().revision, 3, 'conflict must not replay over newer board truth');
});

test('successful Emergency recovery clears both capsule and LIGHTHOUSE working ticket only after readback', async () => {
  const fx = await fixture({ workId:'WORK-CIRC-RECOVER', pinId:'PIN-CIRC-RECOVER' });
  const { createEmergencyCapsule } = await import(emergencyUrl);

  fx.circulation.claimPins({
    receiptId:'CLAIM-CIRC-R',
    workId:fx.workId,
    employeeId:'GO-CIRC-R',
    pinIds:[fx.pinId],
    expectedRevision:1,
    at:'2026-09-19T05:20:00.000Z',
  });
  fx.circulation.stageEmergency(createEmergencyCapsule({
    capsuleId:'CAP-CIRC-R',
    workId:fx.workId,
    employeeId:'GO-CIRC-R',
    reason:'READBACK_UNAVAILABLE',
    baseBoardRevision:2,
    claimedPinIds:[fx.pinId],
    pendingChanges:[{
      pinId:fx.pinId,
      status:'PENDING_RECOVERY',
      result:'staged result',
      nextAction:'verify after reconnect',
      evidence:[{ kind:'factory', reference:'result-r' }],
    }],
    evidence:[{ kind:'route', reference:'reconnect' }],
    at:'2026-09-19T05:21:00.000Z',
  }));

  const recovered = fx.circulation.recoverEmergency({
    capsuleId:'CAP-CIRC-R',
    receiptId:'RECOVER-CIRC-R',
    at:'2026-09-19T05:22:00.000Z',
  });

  assert.equal(recovered.status, 'VERIFIED');
  assert.equal(fx.circulation.activeTickets().length, 0);
  assert.equal(fx.circulation.history().at(-1).status, 'RETURNED');
  assert.equal(fx.boardStore.readEmergencyCapsules().length, 0);
  assert.equal(fx.bridge.readBoard().pins[0].status, 'PENDING_RECOVERY');
});

test('revision conflict on normal return automatically stages an Emergency Capsule and keeps the working ticket', async () => {
  const fx = await fixture({ workId:'WORK-CIRC-AUTO', pinId:'PIN-CIRC-AUTO' });

  fx.circulation.claimPins({
    receiptId:'CLAIM-CIRC-AUTO',
    workId:fx.workId,
    employeeId:'GO-CIRC-AUTO',
    pinIds:[fx.pinId],
    expectedRevision:1,
    at:'2026-09-19T05:24:00.000Z',
  });

  fx.bridge.returnPins({
    receiptId:'RETURN-CIRC-AUTO-NEWER',
    workId:fx.workId,
    employeeId:'GO-CIRC-AUTO',
    expectedRevision:2,
    updates:[{
      pinId:fx.pinId,
      status:'DOING',
      result:'newer board change',
      nextAction:'continue',
      evidence:[],
    }],
    at:'2026-09-19T05:25:00.000Z',
  });

  assert.throws(() => fx.circulation.returnPins({
    receiptId:'RETURN-CIRC-AUTO',
    workId:fx.workId,
    employeeId:'GO-CIRC-AUTO',
    expectedRevision:2,
    updates:[{
      pinId:fx.pinId,
      status:'VERIFY',
      result:'factory result prepared against rev2',
      nextAction:'recover safely',
      evidence:[{ kind:'factory', reference:'auto-conflict' }],
    }],
    at:'2026-09-19T05:26:00.000Z',
  }), /CENTRE_BOARD_REVISION_CONFLICT/);

  const tickets = fx.circulation.activeTickets();
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].status, 'RECOVERY');
  assert.equal(tickets[0].emergencyCapsuleId, 'RETURN-CIRC-AUTO');
  const capsules = fx.boardStore.readEmergencyCapsules();
  assert.equal(capsules.length, 1);
  assert.equal(capsules[0].capsuleId, 'RETURN-CIRC-AUTO');
  assert.equal(capsules[0].baseBoardRevision, 2);
  assert.equal(fx.bridge.readBoard().revision, 3);
});

test('circulation reconcile repairs crash windows from Board truth without making a second truth store', async () => {
  const fx = await fixture({ workId:'WORK-CIRC-RECON', pinId:'PIN-CIRC-RECON' });

  fx.bridge.claimPins({
    receiptId:'CLAIM-BEFORE-CRASH',
    workId:fx.workId,
    employeeId:'GO-CIRC-RECON',
    pinIds:[fx.pinId],
    expectedRevision:1,
    at:'2026-09-19T05:27:00.000Z',
  });
  assert.equal(fx.circulation.activeTickets().length, 0, 'simulated crash occurs before ticket persistence');

  const repaired = fx.circulation.reconcile();
  assert.equal(Object.keys(repaired.active).length, 1);
  assert.equal(fx.circulation.activeTickets()[0].employeeId, 'GO-CIRC-RECON');
  assert.equal(fx.circulation.activeTickets()[0].boardRevision, 2);

  fx.bridge.returnPins({
    receiptId:'RETURN-BEFORE-CRASH-CLOSE',
    workId:fx.workId,
    employeeId:'GO-CIRC-RECON',
    expectedRevision:2,
    updates:[{
      pinId:fx.pinId,
      status:'VERIFY',
      result:'board already accepted result',
      nextAction:'verify evidence',
      evidence:[],
    }],
    at:'2026-09-19T05:28:00.000Z',
  });
  assert.equal(fx.circulation.activeTickets().length, 1, 'simulated crash occurs before ticket close');

  fx.circulation.reconcile();
  assert.equal(fx.circulation.activeTickets().length, 0);
  assert.equal(fx.circulation.history().at(-1).status, 'RETURNED');
  assert.equal(fx.bridge.readBoard().pins[0].status, 'VERIFY');
});

test('GO live monitor exposes the LIGHTHOUSE working set without treating it as Board truth', async () => {
  const { createGoBoardView } = await import(viewUrl);
  const view = createGoBoardView({
    hubStatus:{ pairing:{status:'PAIRED'}, realtime:{status:'LIVE'}, report:{transport:'ONLINE'} },
    runtimeState:{ work:{nextAction:'WAITING_COMMAND'}, inbox:{}, outbox:{} },
    snapshotStatus:{ freshness:'LIVE', revision:30 },
    boardState:{
      boardId:'BOARD-VIEW',
      workId:'WORK-VIEW',
      revision:4,
      updatedAt:'2026-09-19T05:30:00.000Z',
      pins:[{
        pinId:'PIN-VIEW',
        workId:'WORK-VIEW',
        title:'View',
        status:'DOING',
        ownerEmployeeId:'GO-VIEW',
        touchedBy:['GO-VIEW'],
        revision:2,
        updatedAt:'2026-09-19T05:30:00.000Z',
      }],
    },
    circulationState:{
      revision:3,
      updatedAt:'2026-09-19T05:30:01.000Z',
      active:{
        'CLAIM-VIEW':{
          ticketId:'CLAIM-VIEW',
          workId:'WORK-VIEW',
          employeeId:'GO-VIEW',
          pinIds:['PIN-VIEW'],
          status:'ACTIVE',
          boardRevision:4,
          updatedAt:'2026-09-19T05:30:01.000Z',
        },
      },
      history:[],
    },
  });

  assert.equal(view.work.workId, 'WORK-VIEW');
  assert.equal(view.board.revision, 4);
  assert.equal(view.circulation.status, 'ACTIVE');
  assert.equal(view.circulation.ticketId, 'CLAIM-VIEW');
  assert.equal(view.circulation.active, 1);
});

test('app routes Centre Board Control Port mutations through LIGHTHOUSE circulation and keeps Drive archival out of this layer', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../lighthouse-next/app.mjs'), 'utf8');
  const circulation = fs.readFileSync(path.resolve(__dirname, '../lighthouse-next/work-circulation.mjs'), 'utf8');
  const stage = fs.readFileSync(path.resolve(__dirname, '../scripts/stage-lighthouse-next-bundle.mjs'), 'utf8');

  assert.match(app, /createLighthouseWorkCirculation/);
  assert.match(app, /boardBridge:workCirculation/);
  assert.match(app, /circulationState:workCirculation\.state\(\)/);
  assert.match(app, /lighthouse:work-circulation/);
  assert.match(stage, /'work-circulation\.mjs'/);
  assert.doesNotMatch(circulation, /google drive|files__|archive/i);
});
